import { auth } from "@/auth";
import { smoothUpdate, slotKeyFromIso } from "@/lib/effectiveness";
import { applyNaturalLanguageEditSmart } from "@/lib/nl-schedule";
import { prisma } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/user";
import { rescheduleUncompleted } from "@/lib/time-windows";
import { getBusyIntervals } from "@/lib/calendar-read";
import { loadPlanState } from "@/lib/load-plan-state";
import { parseBlackouts, blackoutsToBusy, type ManualBlackout } from "@/lib/blackouts";
import { interpretEdit } from "@/lib/edit-plan";
import { applyEditOps } from "@/lib/apply-edit-ops";
import { packWithScoring } from "@/lib/scoring-pack";
import type { ScheduledSession, SproutPlan } from "@/types/plan";
import { parseTimeWindowsJson } from "@/lib/default-preferences";
import { NextResponse } from "next/server";
import { z } from "zod";

const patch = z.object({
  status: z.enum(["active", "archived", "paused"]).optional(),
  scheduleJson: z.string().optional(),
  naturalLanguage: z.string().optional(),
  rescheduleFrom: z.string().optional(),
  lockSession: z
    .object({ sessionId: z.string(), locked: z.boolean() })
    .optional(),
  freeformNote: z.string().max(2000).nullable().optional(),
  /** Rebuild the schedule from the existing planJson tasks via the scoring packer. Recovery action. */
  rebuildSchedule: z.boolean().optional(),
  manualBlackouts: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        reason: z.string().max(200).optional(),
      })
    )
    .optional(),
  taskFeedback: z
    .object({
      taskId: z.string(),
      completed: z.boolean().optional(),
      effectiveness: z.number().min(1).max(5).optional(),
    })
    .optional(),
});


type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const state = await loadPlanState({
    planId: id,
    userId: s.user.id,
    accessToken: s.accessToken,
  });
  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    plan: state.plan,
    completions: state.completions,
    drift: {
      adoptedIds: state.drift.adoptedIds,
      removedIds: state.drift.removedIds,
    },
    conflicts: {
      locked: state.conflicts.lockedConflicts.map((c) => ({
        sessionId: c.session.id,
        sessionTitle: c.session.title,
        sessionStart: c.session.start,
        sessionEnd: c.session.end,
        overlappingCount: c.overlapping.length,
      })),
      unlockedIds: state.conflicts.unlockedConflictIds,
    },
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const plan = await prisma.learningPlan.findFirst({
    where: { id, userId: s.user.id },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await request.json();
  const p = patch.safeParse(body);
  if (!p.success) {
    return NextResponse.json({ error: p.error.message }, { status: 400 });
  }

  let outSchedule = plan.scheduleJson;
  if (p.data.scheduleJson) {
    outSchedule = p.data.scheduleJson;
  }
  let editSummary: string | null = null;
  let outManualBlackoutsFromAI: string | null = null;
  let outPlanJsonFromAI: string | null = null;
  if (p.data.naturalLanguage) {
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const sproutPlan = JSON.parse(plan.planJson || "{}") as SproutPlan;
    const now = new Date();
    const llm = await interpretEdit({
      request: p.data.naturalLanguage,
      plan: sproutPlan,
      schedule: sessions,
      now,
    });
    if (llm.ok) {
      const pref = await ensureUserPreferences(s.user.id);
      const tw = parseTimeWindowsJson(pref.timeWindows);
      const slotEff = JSON.parse(pref.slotEffectiveness || "{}") as Record<
        string,
        number
      >;
      const calRead = await getBusyIntervals({
        userId: s.user.id,
        accessToken: s.accessToken,
        from: now,
        to: new Date(plan.deadline.getTime() + 864e5),
      });
      const externalBusy = calRead.intervals.filter((b) => !b.isVerdant);
      const result = applyEditOps(llm.ops, {
        plan: sproutPlan,
        schedule: sessions,
        manualBlackoutsJson: plan.manualBlackouts,
        startDate: plan.startDate,
        deadline: new Date(plan.deadline.getTime() + 864e5),
        timeWindows: tw,
        busy: externalBusy,
        maxMinutesPerDay: pref.maxMinutesDay,
        slotEffectiveness: slotEff,
        now,
      });
      outSchedule = JSON.stringify(result.schedule);
      outPlanJsonFromAI = JSON.stringify(result.plan);
      outManualBlackoutsFromAI = result.manualBlackoutsJson;
      editSummary = llm.summary;
    } else {
      // interpretEdit's structured-LLM path failed; fall back to the HF
      // natural-language editor that returns a full updated schedule.
      const { result: r } = await applyNaturalLanguageEditSmart(
        p.data.naturalLanguage,
        sessions,
        now
      );
      if (!r.ok) {
        return NextResponse.json({ error: r.error }, { status: 400 });
      }
      outSchedule = JSON.stringify(r.sessions);
      editSummary = r.message;
    }
  }
  if (p.data.lockSession) {
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const next = sessions.map((sess) =>
      sess.id === p.data.lockSession!.sessionId
        ? { ...sess, locked: p.data.lockSession!.locked }
        : sess
    );
    outSchedule = JSON.stringify(next);
  }
  // Manual blackouts: persist immediately. Triggers a reschedule on the
  // remaining unlocked future sessions (design Q4 γ-fallback).
  let outManualBlackouts: string | null = null;
  if (p.data.manualBlackouts) {
    outManualBlackouts = JSON.stringify(p.data.manualBlackouts);
    if (!p.data.rescheduleFrom) {
      const pref = await ensureUserPreferences(s.user.id);
      const tw = parseTimeWindowsJson(pref.timeWindows);
      const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
      const from = new Date();
      const calRead = await getBusyIntervals({
        userId: s.user.id,
        accessToken: s.accessToken,
        from,
        to: new Date(plan.deadline.getTime() + 864e5),
      });
      const externalBusy = calRead.intervals.filter((b) => !b.isVerdant);
      const blackoutBusy = blackoutsToBusy(p.data.manualBlackouts as ManualBlackout[]);
      const rescheduled = rescheduleUncompleted(
        sessions,
        from,
        new Date(plan.deadline.getTime() + 864e5),
        tw,
        pref.maxMinutesDay,
        [...externalBusy, ...blackoutBusy]
      );
      outSchedule = JSON.stringify(rescheduled);
    }
  }
  if (p.data.rescheduleFrom) {
    const pref = await ensureUserPreferences(s.user.id);
    const tw = parseTimeWindowsJson(pref.timeWindows);
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const from = new Date(p.data.rescheduleFrom);
    const busyRead = await getBusyIntervals({
      userId: s.user.id,
      accessToken: s.accessToken,
      from,
      to: new Date(plan.deadline.getTime() + 864e5),
    });
    const externalBusy = busyRead.intervals.filter((b) => !b.isVerdant);
    const blackoutsJson = outManualBlackouts ?? plan.manualBlackouts;
    const blackoutBusy = blackoutsToBusy(parseBlackouts(blackoutsJson || "[]"));
    const rescheduled = rescheduleUncompleted(
      sessions,
      from,
      new Date(plan.deadline.getTime() + 864e5),
      tw,
      pref.maxMinutesDay,
      [...externalBusy, ...blackoutBusy]
    );
    outSchedule = JSON.stringify(rescheduled);
  }

  // Rebuild schedule from the existing planJson (recovery action). Skips the
  // LLM. Preserves locked future sessions and packs everything else.
  if (p.data.rebuildSchedule) {
    const pref = await ensureUserPreferences(s.user.id);
    const tw = parseTimeWindowsJson(pref.timeWindows);
    const slotEff = JSON.parse(pref.slotEffectiveness || "{}") as Record<
      string,
      number
    >;
    const sproutPlan = JSON.parse(plan.planJson || "{}") as SproutPlan;
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const now = new Date();
    const lockedFuture = sessions.filter(
      (sess) => new Date(sess.start) >= now && sess.locked
    );
    const placedTaskIds = new Set<string>();
    for (const sess of lockedFuture) {
      if (sess.agenda) for (const a of sess.agenda) placedTaskIds.add(a.planTaskId);
      else placedTaskIds.add(sess.planTaskId);
    }
    const tasksToPack = (sproutPlan.tasks ?? []).filter(
      (t) => !placedTaskIds.has(t.id)
    );

    const calRead = await getBusyIntervals({
      userId: s.user.id,
      accessToken: s.accessToken,
      from: now,
      to: new Date(plan.deadline.getTime() + 864e5),
    });
    const externalBusy = calRead.intervals.filter((b) => !b.isVerdant);
    const lockedAsBusy = lockedFuture.map((sess) => ({
      start: new Date(sess.start),
      end: new Date(sess.end),
      calendarEventId: sess.calendarEventId ?? `verdant-locked-${sess.id}`,
      isVerdant: true,
    }));
    const blackoutBusy = blackoutsToBusy(parseBlackouts(plan.manualBlackouts));

    const result = packWithScoring(tasksToPack, {
      startDate: now,
      deadline: new Date(plan.deadline.getTime() + 864e5),
      timeWindows: tw,
      busy: [...externalBusy, ...lockedAsBusy, ...blackoutBusy],
      maxMinutesPerDay: pref.maxMinutesDay,
      slotEffectiveness: slotEff,
    });
    const newSchedule = [...lockedFuture, ...result.schedule].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    outSchedule = JSON.stringify(newSchedule);
    editSummary = `Rebuilt schedule. ${result.overflow.length} task(s) didn't fit.`;
  }

  if (p.data.taskFeedback) {
    const { taskId, completed, effectiveness } = p.data.taskFeedback;
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const sess = sessions.find(
      (x) =>
        x.planTaskId === taskId ||
        x.agenda?.some((a) => a.planTaskId === taskId)
    );
    await prisma.taskCompletion.upsert({
      where: { planId_taskId: { planId: id, taskId } },
      create: {
        planId: id,
        taskId,
        completed: completed ?? false,
        completedAt: completed ? new Date() : null,
        effectiveness: effectiveness ?? null,
      },
      update: {
        ...(completed !== undefined
          ? { completed, completedAt: completed ? new Date() : null }
          : {}),
        ...(effectiveness !== undefined ? { effectiveness } : {}),
      },
    });
    if (effectiveness != null && sess) {
      const key = slotKeyFromIso(sess.start);
      const pref = await ensureUserPreferences(s.user.id);
      const cur = JSON.parse(pref.slotEffectiveness || "{}") as Record<string, number>;
      const next = JSON.stringify(smoothUpdate(cur, key, effectiveness));
      await prisma.userPreference.update({
        where: { userId: s.user.id },
        data: { slotEffectiveness: next },
      });
    }
  }

  const data: {
    status?: string;
    scheduleJson?: string;
    planJson?: string;
    freeformNote?: string | null;
    manualBlackouts?: string;
  } = {};
  if (p.data.status !== undefined) {
    data.status = p.data.status;
  }
  if (outSchedule !== plan.scheduleJson) {
    data.scheduleJson = outSchedule;
  }
  if (outPlanJsonFromAI !== null) {
    data.planJson = outPlanJsonFromAI;
  }
  if (p.data.freeformNote !== undefined) {
    data.freeformNote = p.data.freeformNote;
  }
  if (outManualBlackouts !== null) {
    data.manualBlackouts = outManualBlackouts;
  } else if (outManualBlackoutsFromAI !== null) {
    data.manualBlackouts = outManualBlackoutsFromAI;
  }
  const updated = await prisma.learningPlan.update({
    where: { id },
    data,
  });
  return NextResponse.json({ plan: updated, summary: editSummary });
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const plan = await prisma.learningPlan.findFirst({
    where: { id, userId: s.user.id },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.learningPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

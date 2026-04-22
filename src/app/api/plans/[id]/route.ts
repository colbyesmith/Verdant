import { auth } from "@/auth";
import { smoothUpdate, slotKeyFromIso } from "@/lib/effectiveness";
import { applyNaturalLanguageEdit } from "@/lib/nl-schedule";
import { prisma } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/user";
import { rescheduleUncompleted } from "@/lib/time-windows";
import type { ScheduledSession, TimeWindows } from "@/types/plan";
import { NextResponse } from "next/server";
import { z } from "zod";

const patch = z.object({
  status: z.enum(["active", "archived", "paused"]).optional(),
  scheduleJson: z.string().optional(),
  naturalLanguage: z.string().optional(),
  rescheduleFrom: z.string().optional(),
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
  const plan = await prisma.learningPlan.findFirst({
    where: { id, userId: s.user.id },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const completions = await prisma.taskCompletion.findMany({ where: { planId: id } });
  return NextResponse.json({ plan, completions });
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
  if (p.data.naturalLanguage) {
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const r = applyNaturalLanguageEdit(p.data.naturalLanguage, sessions, new Date());
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 400 });
    }
    outSchedule = JSON.stringify(r.sessions);
  }
  if (p.data.rescheduleFrom) {
    const pref = await ensureUserPreferences(s.user.id);
    const tw: TimeWindows = JSON.parse(pref.timeWindows || "{}") as TimeWindows;
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const from = new Date(p.data.rescheduleFrom);
    const rescheduled = rescheduleUncompleted(
      sessions,
      from,
      new Date(plan.deadline.getTime() + 864e5),
      tw,
      pref.maxMinutesDay
    );
    outSchedule = JSON.stringify(rescheduled);
  }

  if (p.data.taskFeedback) {
    const { taskId, completed, effectiveness } = p.data.taskFeedback;
    const sessions = JSON.parse(outSchedule || "[]") as ScheduledSession[];
    const sess = sessions.find((x) => x.planTaskId === taskId);
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

  const data: { status?: string; scheduleJson?: string } = {};
  if (p.data.status !== undefined) {
    data.status = p.data.status;
  }
  if (outSchedule !== plan.scheduleJson) {
    data.scheduleJson = outSchedule;
  }
  const updated = await prisma.learningPlan.update({
    where: { id },
    data,
  });
  return NextResponse.json({ plan: updated });
}

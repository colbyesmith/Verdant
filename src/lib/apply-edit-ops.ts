/**
 * Deterministic applier for AI-emitted edit ops (design Q7).
 *
 * Mutates the SproutPlan / schedule / blackouts according to the op union
 * defined in `edit-plan.ts`. After mutating the plan-task fields, the future
 * portion of the schedule is rebuilt through `packWithScoring` so all the
 * hint-aware quality from PR #5 is preserved post-edit.
 *
 * Hard constraints (deadline, daily cap, lock semantics) are owned by the
 * scoring packer; this module's job is to translate ops into plan/schedule
 * mutations, not to re-implement constraint solving.
 */
import { parseISO, startOfDay } from "date-fns";
import type {
  PlanTask,
  ScheduledSession,
  SproutPlan,
  TimeWindows,
} from "@/types/plan";
import type { BusyInterval } from "@/lib/calendar-read";
import type { EditOp } from "@/lib/edit-plan";
import { phaseForWeek } from "@/lib/phase";
import { packWithScoring } from "@/lib/scoring-pack";
import {
  parseBlackouts,
  blackoutsToBusy,
  type ManualBlackout,
} from "@/lib/blackouts";
import { buildId } from "@/lib/ids";

export interface ApplyContext {
  plan: SproutPlan;
  schedule: ScheduledSession[];
  manualBlackoutsJson: string;
  startDate: Date;
  deadline: Date;
  timeWindows: TimeWindows;
  busy: BusyInterval[];
  maxMinutesPerDay: number;
  slotEffectiveness: Record<string, number>;
  now: Date;
}

export interface ApplyResult {
  plan: SproutPlan;
  schedule: ScheduledSession[];
  manualBlackoutsJson: string;
  /** Per-op short audit log (op kind + outcome). */
  appliedOps: { op: EditOp["op"]; ok: boolean; note?: string }[];
}

function clampMinutes(m: number): number {
  return Math.max(15, Math.min(90, Math.round(m)));
}

function shiftSession(s: ScheduledSession, deltaDays: number): ScheduledSession {
  const ms = deltaDays * 86_400_000;
  return {
    ...s,
    start: new Date(parseISO(s.start).getTime() + ms).toISOString(),
    end: new Date(parseISO(s.end).getTime() + ms).toISOString(),
  };
}

export function applyEditOps(
  ops: EditOp[],
  ctx: ApplyContext
): ApplyResult {
  let plan: SproutPlan = {
    ...ctx.plan,
    tasks: ctx.plan.tasks.map((t) => ({ ...t })),
    phases: ctx.plan.phases.map((p) => ({ ...p })),
  };
  let schedule = ctx.schedule.map((s) => ({ ...s }));
  let manualBlackouts: ManualBlackout[] = parseBlackouts(ctx.manualBlackoutsJson);
  let needsRepack = false;
  const appliedOps: ApplyResult["appliedOps"] = [];

  for (const op of ops) {
    switch (op.op) {
      case "extend_task": {
        const task = plan.tasks.find((t) => t.id === op.taskId);
        if (!task) {
          appliedOps.push({ op: op.op, ok: false, note: "task not found" });
          break;
        }
        task.minutes = clampMinutes(task.minutes + op.addMinutes);
        needsRepack = true;
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
      case "shift_week": {
        // Adjust schedule directly for already-placed sessions whose underlying
        // task lives in this week. Future repack will redo unlocked sessions
        // anyway, but moving them now means locked sessions in this week move
        // too (intentionally — the user asked to shift the week).
        const taskIds = new Set(
          plan.tasks.filter((t) => t.weekIndex === op.weekIndex).map((t) => t.id)
        );
        let touched = 0;
        schedule = schedule.map((s) => {
          const ids = s.agenda
            ? s.agenda.map((a) => a.planTaskId)
            : [s.planTaskId];
          if (ids.some((id) => taskIds.has(id))) {
            touched++;
            return shiftSession(s, op.deltaDays);
          }
          return s;
        });
        appliedOps.push({ op: op.op, ok: true, note: `${touched} sessions` });
        break;
      }
      case "shift_phase": {
        const phaseCount = plan.phases.length;
        if (op.phaseIndex < 0 || op.phaseIndex >= phaseCount) {
          appliedOps.push({ op: op.op, ok: false, note: "phase out of range" });
          break;
        }
        const taskIds = new Set(
          plan.tasks
            .filter(
              (t) => phaseForWeek(t.weekIndex, phaseCount) === op.phaseIndex
            )
            .map((t) => t.id)
        );
        let touched = 0;
        schedule = schedule.map((s) => {
          const ids = s.agenda
            ? s.agenda.map((a) => a.planTaskId)
            : [s.planTaskId];
          if (ids.some((id) => taskIds.has(id))) {
            touched++;
            return shiftSession(s, op.deltaDays);
          }
          return s;
        });
        appliedOps.push({ op: op.op, ok: true, note: `${touched} sessions` });
        break;
      }
      case "insert_task": {
        const after = plan.tasks.find((t) => t.id === op.afterTaskId);
        if (!after) {
          appliedOps.push({ op: op.op, ok: false, note: "afterTaskId not found" });
          break;
        }
        const newTask: PlanTask = {
          id: buildId("t", "ai-edit", String(plan.tasks.length)),
          title: op.title,
          type: op.type,
          minutes: clampMinutes(op.minutes),
          weekIndex: after.weekIndex,
          dayOffsetInWeek: Math.min(6, after.dayOffsetInWeek + 1),
          priority: op.priority ?? "core",
          mustFollowTaskId: after.id,
          minDaysAfterPredecessor: 1,
        };
        const idx = plan.tasks.findIndex((t) => t.id === after.id);
        plan.tasks = [
          ...plan.tasks.slice(0, idx + 1),
          newTask,
          ...plan.tasks.slice(idx + 1),
        ];
        needsRepack = true;
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
      case "remove_task": {
        const before = plan.tasks.length;
        plan.tasks = plan.tasks.filter((t) => t.id !== op.taskId);
        if (plan.tasks.length === before) {
          appliedOps.push({ op: op.op, ok: false, note: "task not found" });
          break;
        }
        // Drop sessions that referenced the removed task.
        schedule = schedule.flatMap((s) => {
          if (s.agenda) {
            const remainingAgenda = s.agenda.filter(
              (a) => a.planTaskId !== op.taskId
            );
            if (remainingAgenda.length === 0) return [];
            if (remainingAgenda.length === s.agenda.length) return [s];
            return [{ ...s, agenda: remainingAgenda }];
          }
          return s.planTaskId === op.taskId ? [] : [s];
        });
        needsRepack = true;
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
      case "set_priority": {
        const task = plan.tasks.find((t) => t.id === op.taskId);
        if (!task) {
          appliedOps.push({ op: op.op, ok: false, note: "task not found" });
          break;
        }
        task.priority = op.priority;
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
      case "lock_session": {
        const idx = schedule.findIndex((s) => s.id === op.sessionId);
        if (idx === -1) {
          appliedOps.push({ op: op.op, ok: false, note: "session not found" });
          break;
        }
        schedule[idx] = { ...schedule[idx], locked: op.locked };
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
      case "add_blackout": {
        manualBlackouts = [
          ...manualBlackouts,
          { from: op.from, to: op.to, reason: op.reason },
        ];
        needsRepack = true;
        appliedOps.push({ op: op.op, ok: true });
        break;
      }
    }
  }

  if (needsRepack) {
    const fromDate = ctx.now;
    const past = schedule.filter((s) => parseISO(s.end) < fromDate);
    const lockedFuture = schedule.filter(
      (s) => parseISO(s.start) >= fromDate && s.locked
    );
    const placedTaskIds = new Set<string>();
    for (const s of [...past, ...lockedFuture]) {
      if (s.agenda) for (const a of s.agenda) placedTaskIds.add(a.planTaskId);
      else placedTaskIds.add(s.planTaskId);
    }
    const tasksToRepack = plan.tasks.filter((t) => !placedTaskIds.has(t.id));

    const lockedAsBusy: BusyInterval[] = lockedFuture.map((s) => ({
      start: parseISO(s.start),
      end: parseISO(s.end),
      calendarEventId: s.calendarEventId ?? `verdant-locked-${s.id}`,
      isVerdant: true,
    }));
    const blackoutBusy = blackoutsToBusy(manualBlackouts);
    const repackStart =
      startOfDay(fromDate) > ctx.startDate ? startOfDay(fromDate) : ctx.startDate;

    const result = packWithScoring(tasksToRepack, {
      startDate: repackStart,
      deadline: ctx.deadline,
      timeWindows: ctx.timeWindows,
      busy: [...ctx.busy, ...lockedAsBusy, ...blackoutBusy],
      maxMinutesPerDay: ctx.maxMinutesPerDay,
      slotEffectiveness: ctx.slotEffectiveness,
    });

    schedule = [...past, ...lockedFuture, ...result.schedule].sort(
      (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime()
    );
    if (result.overflow.length > 0) {
      appliedOps.push({
        op: "extend_task",
        ok: false,
        note: `${result.overflow.length} task(s) couldn't fit before the deadline after this edit`,
      });
    }
  }

  // Re-sort schedule by start time after any non-repack mutations.
  schedule = schedule.sort(
    (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime()
  );

  // Persist the (possibly modified) plan task ordering & blackouts.
  plan = { ...plan, sessionsPlanned: plan.tasks.length };

  return {
    plan,
    schedule,
    manualBlackoutsJson: JSON.stringify(manualBlackouts),
    appliedOps,
  };
}


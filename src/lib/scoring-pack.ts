/**
 * Slot-scoring packer (design Q5).
 *
 * Replaces the old greedy bucketer when tasks carry hint fields. For each task,
 * in dependency-aware order, the packer enumerates feasible slots in the user's
 * free intervals, scores each candidate against the task's hints + history, and
 * places the task in the highest-scoring slot.
 *
 * Hard constraints (filters):
 *   - Slot fits the duration contiguously inside a free interval.
 *   - Slot ends before the deadline.
 *   - Slot does not overlap any busy interval (calendar events, locked sessions, blackouts).
 *   - mustFollowTaskId predecessor placed earlier and `minDaysAfterPredecessor` honored if feasible.
 *   - Daily cap from `maxMinutesPerDay`.
 *
 * Soft preferences (weights):
 *   - `preferredTimeOfDay` match.
 *   - `weekIndex`/`dayOffsetInWeek` proximity (renamed in design as "ideal" hints).
 *   - Slot effectiveness from past ratings.
 *   - `preferStandalone` bonus when the day is empty.
 */
import { addDays, getDay, startOfDay } from "date-fns";
import type { PlanTask, ScheduledSession, TimeWindows } from "@/types/plan";
import type { BusyInterval } from "@/lib/calendar-read";
import { freeIntervalsForDay } from "@/lib/free-intervals";

export interface ScoringContext {
  startDate: Date;
  deadline: Date;
  timeWindows: TimeWindows;
  busy: BusyInterval[];
  maxMinutesPerDay: number;
  /** Slot effectiveness ratings keyed "<dow>-<HH>". */
  slotEffectiveness: Record<string, number>;
}

export interface PackResult {
  schedule: ScheduledSession[];
  /** Tasks the packer could not place before the deadline. */
  overflow: PlanTask[];
}

interface Candidate {
  start: Date;
  end: Date;
  durationMinutes: number;
}

interface PlacementRecord {
  task: PlanTask;
  start: Date;
  end: Date;
}

const PLAN_DAY_LIMIT = 400;

function clampDur(task: PlanTask, ctx: ScoringContext): number {
  return Math.max(15, Math.min(task.minutes, ctx.maxMinutesPerDay));
}

function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

function dowMonZero(d: Date): number {
  return (getDay(d) + 6) % 7; // 0=Mon
}

function slotEffKey(d: Date): string {
  return `${getDay(d)}-${String(d.getHours()).padStart(2, "0")}`;
}

/**
 * Topological sort: every task whose predecessor is in the set must come after.
 * Then within an independent layer, sort by priority (core first), then weekIndex,
 * then dayOffsetInWeek.
 */
function topologicalOrder(tasks: PlanTask[]): PlanTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  const remaining = new Set(tasks.map((t) => t.id));
  const out: PlanTask[] = [];

  while (remaining.size > 0) {
    const ready: PlanTask[] = [];
    for (const id of remaining) {
      const task = byId.get(id);
      if (!task) continue;
      const dep = task.mustFollowTaskId;
      if (!dep || !remaining.has(dep) || !byId.has(dep)) {
        ready.push(task);
      }
    }
    if (ready.length === 0) {
      // Cycle or dangling reference — break by adding everything remaining.
      for (const id of remaining) {
        const t = byId.get(id);
        if (t) out.push(t);
      }
      break;
    }
    ready.sort((a, b) => {
      const pa = a.priority ?? "core";
      const pb = b.priority ?? "core";
      if (pa !== pb) return pa === "core" ? -1 : 1;
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      if (a.dayOffsetInWeek !== b.dayOffsetInWeek)
        return a.dayOffsetInWeek - b.dayOffsetInWeek;
      return a.id.localeCompare(b.id);
    });
    for (const t of ready) {
      out.push(t);
      remaining.delete(t.id);
    }
  }
  return out;
}

function enumerateCandidates(
  task: PlanTask,
  ctx: ScoringContext,
  earliestStart: Date,
  busy: BusyInterval[],
  dailyMinutesUsed: Map<string, number>
): Candidate[] {
  const dur = clampDur(task, ctx);
  const candidates: Candidate[] = [];
  let cursor = startOfDay(earliestStart);
  const end = startOfDay(ctx.deadline);
  for (let d = 0; d < PLAN_DAY_LIMIT; d++) {
    if (cursor > end) break;
    const usedToday = dailyMinutesUsed.get(dayKey(cursor)) ?? 0;
    if (usedToday + dur <= ctx.maxMinutesPerDay) {
      const frags = freeIntervalsForDay(cursor, ctx.timeWindows, busy);
      for (const frag of frags) {
        let slotStart = frag.start;
        if (slotStart < earliestStart) slotStart = earliestStart;
        if (slotStart < frag.start) slotStart = frag.start;
        const slotEnd = new Date(slotStart.getTime() + dur * 60_000);
        if (slotEnd > frag.end) continue;
        if (slotEnd > ctx.deadline) continue;
        candidates.push({
          start: slotStart,
          end: slotEnd,
          durationMinutes: dur,
        });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return candidates;
}

function todMatchScore(task: PlanTask, slot: Candidate): number {
  const tod = task.preferredTimeOfDay ?? "any";
  if (tod === "any") return 0;
  const hr = slot.start.getHours();
  const isMorning = hr < 12;
  const isAfternoon = hr >= 12 && hr < 17;
  const isEvening = hr >= 17;
  if (
    (tod === "morning" && isMorning) ||
    (tod === "afternoon" && isAfternoon) ||
    (tod === "evening" && isEvening)
  ) {
    return 8;
  }
  return -2;
}

function idealWeekScore(task: PlanTask, slot: Candidate, ctx: ScoringContext): number {
  const slotWeek = Math.floor(
    (startOfDay(slot.start).getTime() - startOfDay(ctx.startDate).getTime()) /
      (7 * 86_400_000)
  );
  const delta = Math.abs(slotWeek - task.weekIndex);
  return Math.max(0, 10 - delta * 5);
}

function idealDayScore(task: PlanTask, slot: Candidate): number {
  const slotDow = dowMonZero(slot.start);
  const delta = Math.abs(slotDow - task.dayOffsetInWeek);
  return Math.max(0, 6 - delta * 2);
}

function effectivenessScore(slot: Candidate, ctx: ScoringContext): number {
  const key = slotEffKey(slot.start);
  return (ctx.slotEffectiveness[key] ?? 0) * 1.0;
}

function standaloneScore(
  task: PlanTask,
  slot: Candidate,
  dailyMinutesUsed: Map<string, number>
): number {
  if (!task.preferStandalone) return 0;
  const used = dailyMinutesUsed.get(dayKey(slot.start)) ?? 0;
  return used === 0 ? 4 : -6; // strongly prefer empty days; penalize sharing
}

function scoreCandidate(
  task: PlanTask,
  slot: Candidate,
  ctx: ScoringContext,
  dailyMinutesUsed: Map<string, number>
): number {
  return (
    todMatchScore(task, slot) +
    idealWeekScore(task, slot, ctx) +
    idealDayScore(task, slot) +
    effectivenessScore(slot, ctx) +
    standaloneScore(task, slot, dailyMinutesUsed)
  );
}

function mergeIntoDailyAgendas(
  placements: PlacementRecord[]
): ScheduledSession[] {
  const byDay = new Map<string, PlacementRecord[]>();
  for (const p of placements) {
    const k = dayKey(p.start);
    const list = byDay.get(k);
    if (list) list.push(p);
    else byDay.set(k, [p]);
  }

  const out: ScheduledSession[] = [];
  for (const [, list] of byDay) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
    const standalones = list.filter((p) => p.task.preferStandalone);
    const groupable = list.filter((p) => !p.task.preferStandalone);

    for (const s of standalones) {
      out.push({
        id: `sess-${s.task.id}`,
        planTaskId: s.task.id,
        title: s.task.title,
        type: s.task.type,
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      });
    }

    if (groupable.length === 1) {
      const only = groupable[0];
      out.push({
        id: `sess-${only.task.id}`,
        planTaskId: only.task.id,
        title: only.task.title,
        type: only.task.type,
        start: only.start.toISOString(),
        end: only.end.toISOString(),
      });
    } else if (groupable.length > 1) {
      const first = groupable[0];
      const last = groupable[groupable.length - 1];
      const dayK = dayKey(first.start);
      out.push({
        id: `sess-day-${dayK}`,
        planTaskId: first.task.id,
        title: `Learning session: ${groupable.map((g) => g.task.title).join(" · ")}`,
        type: first.task.type,
        start: first.start.toISOString(),
        end: last.end.toISOString(),
        agenda: groupable.map((g) => ({
          planTaskId: g.task.id,
          title: g.task.title,
          type: g.task.type,
          minutes: Math.max(
            15,
            Math.round((g.end.getTime() - g.start.getTime()) / 60_000)
          ),
        })),
      });
    }
  }
  return out.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}

export function packWithScoring(
  tasks: PlanTask[],
  ctx: ScoringContext
): PackResult {
  const ordered = topologicalOrder(tasks);
  const placedById = new Map<string, PlacementRecord>();
  const placedBusy: BusyInterval[] = [];
  const dailyMinutesUsed = new Map<string, number>();
  const overflow: PlanTask[] = [];

  for (const task of ordered) {
    let earliest = ctx.startDate;
    if (task.mustFollowTaskId) {
      const pred = placedById.get(task.mustFollowTaskId);
      if (pred) {
        const minDays = task.minDaysAfterPredecessor ?? 0;
        const after = addDays(startOfDay(pred.end), minDays);
        if (after > earliest) earliest = after;
      }
    }
    const candidates = enumerateCandidates(
      task,
      ctx,
      earliest,
      [...ctx.busy, ...placedBusy],
      dailyMinutesUsed
    );
    if (candidates.length === 0) {
      overflow.push(task);
      continue;
    }
    let best = candidates[0];
    let bestScore = scoreCandidate(task, best, ctx, dailyMinutesUsed);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const s = scoreCandidate(task, c, ctx, dailyMinutesUsed);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    placedById.set(task.id, { task, start: best.start, end: best.end });
    placedBusy.push({
      start: best.start,
      end: best.end,
      calendarEventId: `placed-${task.id}`,
      isVerdant: false,
    });
    const k = dayKey(best.start);
    dailyMinutesUsed.set(
      k,
      (dailyMinutesUsed.get(k) ?? 0) + best.durationMinutes
    );
  }

  return {
    schedule: mergeIntoDailyAgendas(Array.from(placedById.values())),
    overflow,
  };
}

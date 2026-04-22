import { addDays, getDay, set, startOfDay } from "date-fns";
import type { ScheduledSession, TimeWindows } from "@/types/plan";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Pick next start time in preferred windows, advancing day by day */
export function firstSlotFrom(
  from: Date,
  durationMinutes: number,
  timeWindows: TimeWindows,
  maxEndDate: Date
): Date | null {
  for (let d = 0; d < 400; d++) {
    const day = addDays(startOfDay(from), d);
    if (day > maxEndDate) return null;
    const wd = String(getDay(day));
    const w = timeWindows[wd] ?? timeWindows[wd === "0" ? "7" : wd];
    if (!w) continue;
    const startH = (w as { start: string; end: string }).start;
    const endH = (w as { start: string; end: string }).end;
    const wStartM = toMinutes(startH);
    const wEndM = toMinutes(endH);
    if (wEndM - wStartM < durationMinutes) continue;

    const dayStart = set(day, {
      hours: Math.floor(wStartM / 60),
      minutes: wStartM % 60,
      seconds: 0,
      milliseconds: 0,
    });
    if (d === 0 && from > dayStart) {
      const at = new Date(from);
      const m = at.getHours() * 60 + at.getMinutes();
      if (m + durationMinutes <= wEndM && m >= wStartM) {
        return at;
      }
    }
    if (d > 0 || from <= dayStart) {
      return dayStart;
    }
  }
  return null;
}

/**
 * Distribute plan tasks as sessions from start to deadline, respecting
 * max minutes per day and time windows. Greedy: fill days left-to-right.
 */
export function buildScheduleFromPlan(
  tasks: { id: string; title: string; type: ScheduledSession["type"]; minutes: number }[],
  startDate: Date,
  deadline: Date,
  timeWindows: TimeWindows,
  maxMinutesPerDay: number
): ScheduledSession[] {
  const byDay: Record<string, number> = {};
  const out: ScheduledSession[] = [];
  // Sort: lessons first, then reviews, then milestones, by id for stability
  const order: Record<ScheduledSession["type"], number> = {
    lesson: 0,
    review: 1,
    milestone: 2,
  };
  const sorted = [...tasks].sort(
    (a, b) => order[a.type] - order[b.type] || a.id.localeCompare(b.id)
  );

  for (const t of sorted) {
    const dur = Math.max(15, Math.min(t.minutes, maxMinutesPerDay));
    const slot = findNextSlot(
      out,
      startOfDay(startDate),
      startDate,
      deadline,
      timeWindows,
      maxMinutesPerDay,
      dur,
      byDay
    );
    if (!slot) {
      // squeeze: place at last possible day
      const fallback = firstSlotFrom(startDate, dur, timeWindows, deadline);
      if (fallback) {
        const end = new Date(fallback.getTime() + dur * 60 * 1000);
        out.push({
          id: `sess-${t.id}`,
          planTaskId: t.id,
          start: fallback.toISOString(),
          end: end.toISOString(),
          title: t.title,
          type: t.type,
        });
      }
      continue;
    }
    const { start, dayKey } = slot;
    byDay[dayKey] = (byDay[dayKey] ?? 0) + dur;
    out.push({
      id: `sess-${t.id}`,
      planTaskId: t.id,
      start: start.toISOString(),
      end: new Date(start.getTime() + dur * 60 * 1000).toISOString(),
      title: t.title,
      type: t.type,
    });
  }

  return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function findNextSlot(
  existing: ScheduledSession[],
  rangeStart: Date,
  from: Date,
  deadline: Date,
  timeWindows: TimeWindows,
  maxPerDay: number,
  durationMinutes: number,
  byDay: Record<string, number>
): { start: Date; dayKey: string } | null {
  const fromDay = startOfDay(from);
  for (let d = 0; d < 400; d++) {
    const day = addDays(fromDay, d);
    if (day > startOfDay(deadline)) return null;
    const dayKey = day.toISOString().slice(0, 10);
    if ((byDay[dayKey] ?? 0) + durationMinutes > maxPerDay) continue;

    const wd = String(getDay(day));
    const w = timeWindows[wd] ?? timeWindows["1"];
    if (!w) continue;
    const startH = (w as { start: string; end: string }).start;
    const endH = (w as { start: string; end: string }).end;
    const wStartM = toMinutes(startH);
    const wEndM = toMinutes(endH);
    if (wEndM - wStartM < durationMinutes) continue;

    // Earliest time that day after existing same-day sessions
    const sameDay = existing
      .concat()
      .filter((s) => s.start.slice(0, 10) === dayKey);
    const dayBase = set(day, {
      hours: Math.floor(wStartM / 60),
      minutes: wStartM % 60,
      seconds: 0,
      milliseconds: 0,
    });
    let cursor = d === 0 && from > dayBase && from < set(day, { hours: 23, minutes: 59 }) ? from : dayBase;
    const mEnd = set(day, {
      hours: Math.floor(wEndM / 60),
      minutes: wEndM % 60,
    });
    for (const s of sameDay) {
      const sEnd = new Date(s.end);
      if (sEnd > cursor) cursor = sEnd;
    }
    const cMin = cursor.getHours() * 60 + cursor.getMinutes();
    if (cMin + durationMinutes > wEndM) continue;
    if (cMin < wStartM) {
      cursor = dayBase;
    }
    if (cursor < rangeStart) continue;
    if (byDay[dayKey]! + durationMinutes > maxPerDay) continue;
    if (new Date(cursor.getTime() + durationMinutes * 60 * 1000) > mEnd) continue;
    if (day > startOfDay(deadline)) return null;
    return { start: cursor, dayKey };
  }
  return null;
}

/**
 * Rebalance: keep completed/past as-is, rebuild all future session times from
 * the same task set using current constraints and deadline.
 */
export function rescheduleUncompleted(
  sessions: ScheduledSession[],
  fromDate: Date,
  deadline: Date,
  timeWindows: TimeWindows,
  maxPerDay: number
): ScheduledSession[] {
  const past = sessions.filter((s) => new Date(s.end) < fromDate);
  const future = sessions.filter((s) => new Date(s.start) >= fromDate);
  if (future.length === 0) {
    return past.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }
  const tasks = future.map((s) => ({
    id: s.planTaskId,
    title: s.title,
    type: s.type,
    minutes: Math.max(
      15,
      Math.floor(
        (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000
      )
    ),
  }));
  const newSched = buildScheduleFromPlan(
    tasks,
    fromDate,
    deadline,
    timeWindows,
    maxPerDay
  );
  return [...past, ...newSched].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}

/**
 * Bias: prefer slots with higher effectiveness score (heuristic: parse slot key)
 */
export function scoreSlot(
  _start: Date,
  _effectiveness: Record<string, number>
): number {
  return 0;
}

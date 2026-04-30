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

function maxMinutesThatFitInWindow(
  day: Date,
  timeWindows: TimeWindows,
  maxMinutesPerDay: number
): number {
  const wd = String(getDay(startOfDay(day)));
  const w = timeWindows[wd] ?? timeWindows["1"];
  if (!w) return 0;
  const span =
    toMinutes((w as { end: string }).end) - toMinutes((w as { start: string }).start);
  return Math.max(0, Math.min(maxMinutesPerDay, span));
}

function advanceToLearnableDay(
  from: Date,
  timeWindows: TimeWindows,
  deadline: Date
): Date | null {
  let cur = startOfDay(from);
  const end = startOfDay(deadline);
  for (let i = 0; i < 400; i++) {
    if (cur > end) return null;
    if (maxMinutesThatFitInWindow(cur, timeWindows, 24 * 60) > 0) return cur;
    cur = addDays(cur, 1);
  }
  return null;
}

/** Start of the single daily learning block (preferred window + notBefore). */
function sessionStartOnDay(
  day: Date,
  notBefore: Date,
  durationMinutes: number,
  timeWindows: TimeWindows,
  deadline: Date
): Date | null {
  const sod = startOfDay(day);
  if (sod > startOfDay(deadline)) return null;
  const wd = String(getDay(sod));
  const w = timeWindows[wd] ?? timeWindows["1"];
  if (!w) return null;
  const startH = (w as { start: string; end: string }).start;
  const endH = (w as { end: string }).end;
  const wStartM = toMinutes(startH);
  const wEndM = toMinutes(endH);
  if (wEndM - wStartM < durationMinutes) return null;

  let cursor = set(sod, {
    hours: Math.floor(wStartM / 60),
    minutes: wStartM % 60,
    seconds: 0,
    milliseconds: 0,
  });
  if (notBefore > cursor) cursor = new Date(notBefore);
  const cMin = cursor.getHours() * 60 + cursor.getMinutes();
  if (cMin + durationMinutes > wEndM) return null;
  const endMs = cursor.getTime() + durationMinutes * 60 * 1000;
  if (endMs > deadline.getTime()) return null;
  return cursor;
}

function titleForDailyBlock(
  items: { title: string; type: ScheduledSession["type"] }[]
): string {
  if (items.length === 1) return items[0].title;
  return `Learning session: ${items.map((x) => x.title).join(" · ")}`;
}

/**
 * One meeting per calendar day. Tasks scheduled on the same day are merged into
 * one block whose title lists everything to accomplish in that session.
 */
export function buildScheduleFromPlan(
  tasks: { id: string; title: string; type: ScheduledSession["type"]; minutes: number }[],
  startDate: Date,
  deadline: Date,
  timeWindows: TimeWindows,
  maxMinutesPerDay: number
): ScheduledSession[] {
  const order: Record<ScheduledSession["type"], number> = {
    lesson: 0,
    review: 1,
    milestone: 2,
  };
  const sorted = [...tasks].sort(
    (a, b) => order[a.type] - order[b.type] || a.id.localeCompare(b.id)
  );

  type T = (typeof sorted)[number];
  let cursorDay =
    advanceToLearnableDay(startOfDay(startDate), timeWindows, deadline) ??
    startOfDay(startDate);
  let bucket: T[] = [];
  let bucketMins = 0;
  const dayBuckets: Array<{ day: Date; items: T[]; minutes: number }> = [];

  function flush() {
    if (bucket.length === 0) return;
    dayBuckets.push({
      day: new Date(cursorDay),
      items: [...bucket],
      minutes: bucketMins,
    });
    bucket = [];
    bucketMins = 0;
  }

  for (const t of sorted) {
    let dur = Math.max(15, Math.min(t.minutes, maxMinutesPerDay));
    let guard = 0;
    while (guard < 500) {
      guard++;
      let dayCap = maxMinutesThatFitInWindow(cursorDay, timeWindows, maxMinutesPerDay);
      if (dayCap === 0) {
        flush();
        const next = advanceToLearnableDay(addDays(cursorDay, 1), timeWindows, deadline);
        if (!next) break;
        cursorDay = next;
        continue;
      }
      if (dur > dayCap) {
        if (guard > 120) {
          dur = dayCap;
        } else {
          const next = advanceToLearnableDay(addDays(cursorDay, 1), timeWindows, deadline);
          if (!next) break;
          cursorDay = next;
          continue;
        }
      }
      if (bucket.length > 0 && bucketMins + dur > dayCap) {
        flush();
        const next = advanceToLearnableDay(addDays(cursorDay, 1), timeWindows, deadline);
        if (!next) break;
        cursorDay = next;
        continue;
      }
      bucket.push(t);
      bucketMins += dur;
      break;
    }
  }
  flush();

  const out: ScheduledSession[] = [];
  for (const b of dayBuckets) {
    const sod = startOfDay(b.day);
    const dayKey = sod.toISOString().slice(0, 10);
    const notBefore =
      sod.getTime() === startOfDay(startDate).getTime() ? startDate : sod;
    const start = sessionStartOnDay(
      sod,
      notBefore,
      b.minutes,
      timeWindows,
      deadline
    );
    if (!start) continue;

    const agenda = b.items.map((x) => ({
      planTaskId: x.id,
      title: x.title,
      type: x.type,
      minutes: Math.max(15, Math.min(x.minutes, maxMinutesPerDay)),
    }));
    const first = agenda[0];
    out.push({
      id: `sess-day-${dayKey}`,
      planTaskId: first.planTaskId,
      agenda: agenda.length > 1 ? agenda : undefined,
      start: start.toISOString(),
      end: new Date(start.getTime() + b.minutes * 60 * 1000).toISOString(),
      title: titleForDailyBlock(b.items),
      type: first.type,
    });
  }

  if (out.length === 0 && sorted.length > 0) {
    const t = sorted[0];
    const dur = Math.max(15, Math.min(t.minutes, maxMinutesPerDay));
    const fallback = firstSlotFrom(startDate, dur, timeWindows, deadline);
    if (fallback) {
      out.push({
        id: `sess-${t.id}`,
        planTaskId: t.id,
        start: fallback.toISOString(),
        end: new Date(fallback.getTime() + dur * 60 * 1000).toISOString(),
        title: t.title,
        type: t.type,
      });
    }
  }

  return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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
  const tasks = future.flatMap((s) => {
    if (s.agenda && s.agenda.length > 0) {
      return s.agenda.map((a) => ({
        id: a.planTaskId,
        title: a.title,
        type: a.type,
        minutes: Math.max(15, a.minutes),
      }));
    }
    return [
      {
        id: s.planTaskId,
        title: s.title,
        type: s.type,
        minutes: Math.max(
          15,
          Math.floor(
            (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000
          )
        ),
      },
    ];
  });
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

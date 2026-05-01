/**
 * Compose the user's declared `timeWindows` with calendar busy intervals to
 * produce per-day free sub-intervals (design Q2: windows ∩ ¬busy).
 *
 * Behavior contract:
 *   - When `busy === []`, each day yields a single sub-interval that exactly
 *     matches the day's `timeWindows` entry. The existing packer therefore
 *     behaves identically to the pre-busy world.
 *   - When `busy` is non-empty, the day's window is fragmented into the
 *     gaps between busy intervals, clamped to the window edges.
 */
import { addDays, getDay, set, startOfDay } from "date-fns";
import type { TimeWindows } from "@/types/plan";
import type { BusyInterval } from "@/lib/calendar-read";

export interface FreeInterval {
  start: Date;
  end: Date;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function dayWindow(day: Date, timeWindows: TimeWindows): FreeInterval | null {
  const wd = String(getDay(startOfDay(day)));
  const w = timeWindows[wd] ?? timeWindows[wd === "0" ? "7" : wd];
  if (!w) return null;
  const wStart = (w as { start: string; end: string }).start;
  const wEnd = (w as { start: string; end: string }).end;
  const sm = toMinutes(wStart);
  const em = toMinutes(wEnd);
  if (em <= sm) return null;
  const sod = startOfDay(day);
  return {
    start: set(sod, { hours: Math.floor(sm / 60), minutes: sm % 60, seconds: 0, milliseconds: 0 }),
    end: set(sod, { hours: Math.floor(em / 60), minutes: em % 60, seconds: 0, milliseconds: 0 }),
  };
}

/**
 * Subtract overlapping busy intervals from a single window. Returns the gaps.
 */
function subtractBusy(
  window: FreeInterval,
  busy: BusyInterval[]
): FreeInterval[] {
  const overlapping = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .map((b) => ({
      start: b.start < window.start ? window.start : b.start,
      end: b.end > window.end ? window.end : b.end,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (overlapping.length === 0) return [window];

  const merged: FreeInterval[] = [];
  for (const o of overlapping) {
    const last = merged[merged.length - 1];
    if (last && o.start <= last.end) {
      if (o.end > last.end) last.end = o.end;
    } else {
      merged.push({ start: new Date(o.start), end: new Date(o.end) });
    }
  }

  const out: FreeInterval[] = [];
  let cursor = window.start;
  for (const m of merged) {
    if (m.start > cursor) {
      out.push({ start: cursor, end: m.start });
    }
    if (m.end > cursor) cursor = m.end;
  }
  if (cursor < window.end) out.push({ start: cursor, end: window.end });
  return out;
}

/**
 * Free sub-intervals for a single calendar day = (day's window) ∩ ¬busy.
 */
export function freeIntervalsForDay(
  day: Date,
  timeWindows: TimeWindows,
  busy: BusyInterval[]
): FreeInterval[] {
  const w = dayWindow(day, timeWindows);
  if (!w) return [];
  return subtractBusy(w, busy);
}

/**
 * Free sub-intervals for an inclusive day range.
 */
export function freeIntervalsForRange(
  from: Date,
  to: Date,
  timeWindows: TimeWindows,
  busy: BusyInterval[]
): FreeInterval[] {
  const out: FreeInterval[] = [];
  const start = startOfDay(from);
  const end = startOfDay(to);
  for (let d = 0; d < 400; d++) {
    const day = addDays(start, d);
    if (day > end) break;
    out.push(...freeIntervalsForDay(day, timeWindows, busy));
  }
  return out;
}

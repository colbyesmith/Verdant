import { addDays, addWeeks, setHours, setMinutes, startOfDay } from "date-fns";
import type { ScheduledSession } from "@/types/plan";

/**
 * Very small MVP: parse phrases like "move tomorrow to Thursday night" or "make this week lighter"
 * (lighter = reduce each session by 20% min 15m, or spread to next week if possible)
 */
export function applyNaturalLanguageEdit(
  text: string,
  sessions: ScheduledSession[],
  now: Date
): { ok: true; sessions: ScheduledSession[]; message: string } | { ok: false; error: string } {
  const t = text.toLowerCase().trim();
  if (!t) return { ok: false, error: "Empty message" };

  const out = sessions.map((s) => ({ ...s }));

  if (t.includes("lighter") || t.includes("easier")) {
    for (const s of out) {
      const start = new Date(s.start);
      const end = new Date(s.end);
      const dur = Math.max(15, Math.floor((end.getTime() - start.getTime()) * 0.8 / 60000));
      s.end = new Date(start.getTime() + dur * 60 * 1000).toISOString();
    }
    return { ok: true, sessions: out, message: "Shortened each session (min 15 min) for a lighter week." };
  }

  if (t.includes("tomorrow") && t.includes("thursday")) {
    const tom = addDays(startOfDay(now), 1);
    const thu = nextWeekdayFrom(now, 4);
    for (const s of out) {
      if (s.start.slice(0, 10) === tom.toISOString().slice(0, 10)) {
        const d = new Date(s.start);
        const h = d.getHours();
        const m = d.getMinutes();
        const target = setMinutes(
          setHours(startOfDay(thu), t.includes("night") ? 20 : h),
          t.includes("night") ? 0 : m
        );
        const duration = new Date(s.end).getTime() - d.getTime();
        s.start = target.toISOString();
        s.end = new Date(target.getTime() + duration).toISOString();
      }
    }
    return { ok: true, sessions: out, message: "Moved sessions scheduled for tomorrow to Thursday." };
  }

  if (t.includes("next week")) {
    for (const s of out) {
      if (new Date(s.start) >= startOfDay(now)) {
        s.start = addWeeks(new Date(s.start), 1).toISOString();
        s.end = addWeeks(new Date(s.end), 1).toISOString();
      }
    }
    return { ok: true, sessions: out, message: "Shifted future sessions by one week." };
  }

  return {
    ok: false,
    error:
      "Try: “make this week lighter”, “move tomorrow to Thursday night”, or “push to next week”.",
  };
}

function nextWeekdayFrom(d: Date, targetDow: number): Date {
  // date-fns: 0=Sun, Thu=4
  const cur = d.getDay();
  let add = (targetDow - cur + 7) % 7;
  if (add === 0) add = 7;
  return addDays(startOfDay(d), add);
}

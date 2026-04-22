import type { TimeWindows } from "@/types/plan";

/** Mon–Fri 7–10p, Sat 10–1, Sun 3–6p */
export const DEFAULT_TIME_WINDOWS: TimeWindows = {
  "0": { start: "15:00", end: "18:00" },
  "1": { start: "19:00", end: "22:00" },
  "2": { start: "19:00", end: "22:00" },
  "3": { start: "19:00", end: "22:00" },
  "4": { start: "19:00", end: "22:00" },
  "5": { start: "19:00", end: "22:00" },
  "6": { start: "10:00", end: "13:00" },
};

export function defaultTimeWindowsJson(): string {
  return JSON.stringify(DEFAULT_TIME_WINDOWS);
}

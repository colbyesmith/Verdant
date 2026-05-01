export type TaskType = "lesson" | "review" | "milestone";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface PlanTask {
  id: string;
  title: string;
  type: TaskType;
  minutes: number;
  /**
   * Soft hint: AI-preferred week offset from `startDate` (0 = first week).
   * Honored by the scoring packer as a preference, not a hard constraint.
   */
  weekIndex: number;
  /** Soft hint: AI-preferred day-of-week (0 = Mon, 6 = Sun). */
  dayOffsetInWeek: number;
  description?: string;
  resourceRef?: string;

  // --- Hint fields (design Q5). Optional with sensible defaults so old plans keep working. ---
  /** AI-preferred time of day. Defaults to "any" when absent. */
  preferredTimeOfDay?: TimeOfDay;
  /** Spacing rule: this task must come after the named predecessor. */
  mustFollowTaskId?: string;
  /** Minimum days between predecessor and this task (used with mustFollowTaskId). */
  minDaysAfterPredecessor?: number;
  /** When true, packer won't merge this task with others into a daily block. */
  preferStandalone?: boolean;
  /** Drop-order signal: stretch tasks dropped first when overflow can't fit before deadline. */
  priority?: "core" | "stretch";
}

export interface SproutPlan {
  summary: string;
  phases: { name: string; focus: string }[];
  tasks: PlanTask[];
  /**
   * Optional structured fields captured from the AI plan generator,
   * exposed via the AI plan disclosure on the tend page.
   */
  rationale?: string[];
  weeklyShape?: {
    lessons: number;
    reviews: number;
    milestoneEvery: string;
  };
  sessionsPlanned?: number;
}

/** One Fern's note rendered above the phase trail on the tend page. */
export interface FernNote {
  kicker: string; // e.g. "fern's note"
  body: string;
}

export interface TimeWindow {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/**
 * Per-day list of allowed time windows. Keys are weekday indices using
 * `Date.getDay()` semantics (Sun=0..Sat=6). Each day maps to zero or more
 * non-overlapping `{start, end}` ranges; the heatmap UI lets users pick
 * non-contiguous hours, which coalesce into the minimal set of ranges per day.
 */
export type TimeWindows = Record<string, TimeWindow[] | undefined>;

export interface ScheduledSession {
  id: string;
  /** First task in this block (for backwards compatibility). */
  planTaskId: string;
  /**
   * When several plan tasks share one daily meeting, listed here with minutes.
   * Omitted for legacy single-task sessions.
   */
  agenda?: Array<{
    planTaskId: string;
    title: string;
    type: TaskType;
    minutes: number;
  }>;
  start: string; // ISO
  end: string;
  /** Event title: combined agenda titles when multiple tasks share the block. */
  title: string;
  type: TaskType;
  calendarEventId?: string;
  googleSynced?: boolean;
  /**
   * When true, the packer treats this session as a hard external block:
   * it stays put on reschedules and blocks other tasks from its slot. Set
   * via the tend-page toggle, or implicitly when the user drags the event
   * inside Google Calendar (drift adoption).
   */
  locked?: boolean;
}

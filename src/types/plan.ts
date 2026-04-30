export type TaskType = "lesson" | "review" | "milestone";

export interface PlanTask {
  id: string;
  title: string;
  type: TaskType;
  minutes: number;
  /**
   * 0 = first week; use relative ordering
   */
  weekIndex: number;
  dayOffsetInWeek: number;
  description?: string;
  resourceRef?: string;
}

export interface SproutPlan {
  summary: string;
  phases: { name: string; focus: string }[];
  tasks: PlanTask[];
}

export interface TimeWindow {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** weekday 0-6, Sunday=0 in JS; we also accept 1-7 in UI as Mon-Sun */
export type TimeWindows = Record<string, { start: string; end: string } | TimeWindow | undefined>;

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
}

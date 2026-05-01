/**
 * Prompt for converting natural-language plan edits into a closed union of
 * structured operations (design Q7). The model only sees a compact JSON view
 * of the plan + schedule and must emit ops the deterministic applier knows.
 */

export const EDIT_PLAN_MODEL = "gpt-4o-mini";
export const EDIT_PLAN_TEMPERATURE = 0.2;

export const EDIT_PLAN_SYSTEM = `You translate a learner's request to change their study plan into a list of structured edit operations.

Rules:
- Output a single JSON object: { "ops": EditOp[], "summary": string }.
- "summary" is a short one-line confirmation of what you did, in plain prose.
- Only emit ops from the closed union shown in the user message. Anything else is invalid.
- If the request is ambiguous, pick the smallest reasonable interpretation.
- If the request asks for something the union cannot express, return { "ops": [], "summary": "I can't do that — try rephrasing." }.
- Never invent task ids. Only reference ids that exist in the plan view.
- Prefer "shift_week" / "shift_phase" over per-task moves when the user describes a range.
- Reviews must still come after the lessons they reinforce — don't break that.

No commentary, no markdown, no code fences.`;

export interface EditPlanPromptInput {
  request: string;
  /** Compact view of the plan: phases + tasks (id, title, type, weekIndex, priority). */
  planView: {
    phases: { name: string; focus: string }[];
    tasks: {
      id: string;
      title: string;
      type: string;
      weekIndex: number;
      priority?: string;
    }[];
  };
  /** Compact view of upcoming sessions: id, taskId, start ISO, locked flag. */
  scheduleView: {
    id: string;
    planTaskId: string;
    title: string;
    start: string;
    locked: boolean;
  }[];
  todayIso: string;
}

export function buildEditPlanUserPrompt(input: EditPlanPromptInput): string {
  return [
    `Today: ${input.todayIso}`,
    ``,
    `User request:`,
    `"""`,
    input.request,
    `"""`,
    ``,
    `Plan view:`,
    JSON.stringify(input.planView, null, 2),
    ``,
    `Upcoming sessions (next 30 days, may be partial):`,
    JSON.stringify(input.scheduleView.slice(0, 40), null, 2),
    ``,
    `Allowed ops (closed union):`,
    JSON.stringify(
      [
        {
          op: "extend_task",
          taskId: "string",
          addMinutes:
            "integer (positive to lengthen, negative to shorten; resulting minutes clamped to [15, 90])",
        },
        {
          op: "shift_week",
          weekIndex: "integer >= 0",
          deltaDays:
            "integer; positive shifts later, negative earlier. Applies to every session whose task has this weekIndex.",
        },
        {
          op: "shift_phase",
          phaseIndex: "integer >= 0",
          deltaDays: "integer days to shift the entire phase",
        },
        {
          op: "insert_task",
          afterTaskId: "string — id the new task should follow",
          title: "string",
          type: '"lesson" | "review" | "milestone"',
          minutes: "integer in [15, 90]",
          priority: '"core" | "stretch"',
        },
        {
          op: "remove_task",
          taskId: "string",
        },
        {
          op: "set_priority",
          taskId: "string",
          priority: '"core" | "stretch"',
        },
        {
          op: "lock_session",
          sessionId: "string",
          locked: "boolean",
        },
        {
          op: "add_blackout",
          from: 'YYYY-MM-DD (inclusive)',
          to: 'YYYY-MM-DD (inclusive)',
          reason: "OPTIONAL string",
        },
      ],
      null,
      2
    ),
    ``,
    `Return JSON of this exact shape: { "ops": [...], "summary": "..." }`,
  ].join("\n");
}

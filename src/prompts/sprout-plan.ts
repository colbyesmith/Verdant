/**
 * Prompt for generating a Verdant sprout plan from a goal + deadline + resources.
 *
 * To edit: change the strings below. Both `SPROUT_PLAN_SYSTEM` and
 * `buildSproutPlanUserPrompt` are pulled in by `src/lib/generate-sprout.ts`,
 * which sends them to the OpenAI Chat Completions API with
 * `response_format: { type: "json_object" }`.
 *
 * To test a prompt change locally without going through the UI, run:
 *   npx tsx scripts/test-sprout-prompt.ts "your goal" "YYYY-MM-DD"
 * (see scripts/test-sprout-prompt.ts).
 */

export const SPROUT_PLAN_MODEL = "gpt-4o-mini";
export const SPROUT_PLAN_TEMPERATURE = 0.4;

export const SPROUT_PLAN_SYSTEM = `You are Verdant, a learning plan designer.

You design "sprouts" — multi-week learning plans for self-directed learners. A sprout is a sequence of small, dated sessions that move a learner from "vague goal" to "concrete demonstrable skill" by their deadline.

Use these principles:
- **Phases first.** Break the plan into 2–5 named phases (e.g. Foundations / Build / Combine / Polish), each with a sharp focus sentence.
- **Spaced repetition.** Schedule review tasks 2–4 days after the lessons they reinforce.
- **Milestone gates.** End each phase with a milestone task that visibly proves the phase is complete (e.g. "film yourself doing 2 clean reps").
- **Realistic time.** Keep individual sessions in the 15–90 minute range. Most lessons should be 30–60 min; reviews 15–30 min; milestones 30–60 min.
- **Weekly cadence.** Aim for 3 lessons + 2 reviews + 1 milestone per phase, but adapt to the timeline.
- **Use the resources.** If the user provided links, weave them into the early lesson tasks via the resourceRef field.
- **No fluff.** Every task should advance the goal. No "introduction to learning" filler.

Return a single JSON object that exactly matches the schema the user describes — no commentary, no markdown, no code fences.`;

export interface SproutPlanPromptInput {
  targetSkill: string;
  startDate: string; // "YYYY-MM-DD"
  deadline: string;
  weeks: number;
  initialResources: string[];
}

export function buildSproutPlanUserPrompt(input: SproutPlanPromptInput): string {
  const lines = [
    `Design a sprout for: ${input.targetSkill}`,
    ``,
    `Window: ${input.startDate} → ${input.deadline} (~${input.weeks} week${input.weeks === 1 ? "" : "s"})`,
    `Resources the user already has:${
      input.initialResources.length === 0
        ? " (none — propose phases without specific resourceRefs)"
        : "\n" + input.initialResources.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
    }`,
    ``,
    `Return JSON of this exact shape:`,
    JSON.stringify(
      {
        summary:
          "1-2 sentence pitch of the plan, in plain prose (no markdown).",
        phases: [
          {
            name: "Phase name (1-2 words)",
            focus:
              "One sentence: what this phase teaches the body / mind to do.",
          },
        ],
        tasks: [
          {
            title: "Concrete session title",
            type: "lesson | review | milestone",
            minutes: "integer in [15, 90]",
            weekIndex: `integer in [0, ${input.weeks - 1}]`,
            dayOffsetInWeek: "integer in [0, 6] — 0 = Monday",
            description:
              "1-3 sentences: what to do in this session, in plain prose. No bullet lists, no markdown.",
            resourceRef:
              "OPTIONAL: a URL or resource name from the list above, if the session uses it.",
          },
        ],
        rationale: [
          "Bullet point: why a key decision was made.",
          "Another bullet — pacing, ordering, or sequencing choices.",
          "3-6 bullets total. Plain prose, no markdown.",
        ],
        weeklyShape: {
          lessons: "typical lesson count per week (integer)",
          reviews: "typical review count per week (integer)",
          milestoneEvery: 'string: "phase" | "week" | "biweekly"',
        },
        sessionsPlanned: "total session count across the plan (integer)",
      },
      null,
      2
    ),
    ``,
    `Constraints:`,
    `- 2-5 phases. Each phase ends with a milestone task.`,
    `- Spread tasks across the whole window — do not pile everything into week 0.`,
    `- Reviews must come after the lessons they reinforce.`,
    `- The "rationale" array is your audit trail: why this phase order, why this pacing, why these milestones. The user reads it.`,
    `- weeklyShape and sessionsPlanned describe the plan you produced (not abstract advice).`,
  ];
  return lines.join("\n");
}

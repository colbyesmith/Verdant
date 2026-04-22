import OpenAI from "openai";
import { z } from "zod";
import type { SproutPlan, TaskType } from "@/types/plan";
import { buildId } from "./ids";

const planSchema = z.object({
  summary: z.string(),
  phases: z.array(z.object({ name: z.string(), focus: z.string() })),
  tasks: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      type: z.enum(["lesson", "review", "milestone"]),
      minutes: z.number().min(5).max(120),
      weekIndex: z.number().min(0),
      dayOffsetInWeek: z.number().min(0).max(6),
      description: z.string().optional(),
      resourceRef: z.string().optional(),
    })
  ),
});

const SYSTEM = `You are Verdant, a learning plan designer. Output only valid JSON matching the schema. 
Create a "sprout" plan: tasks must be one of: lesson (intro/drill), review (spaced reinforcement), milestone (check progress).
Use realistic time estimates. Spread across weeks before the deadline.`;

function fallbackPlan(
  targetSkill: string,
  resources: string[],
  weeks: number
): SproutPlan {
  const w = Math.max(1, weeks);
  const tasks: SproutPlan["tasks"] = [];
  let i = 0;
  for (let week = 0; week < w; week++) {
    const base = `week-${week}`;
    tasks.push({
      id: buildId("t", base, String(i++)),
      title: `${targetSkill} — foundation study`,
      type: "lesson",
      minutes: 45,
      weekIndex: week,
      dayOffsetInWeek: 0,
      description: resources[0] ? `Work through: ${resources[0]}` : "Core concepts",
    });
    tasks.push({
      id: buildId("t", base, String(i++)),
      title: `${targetSkill} — practice`,
      type: "lesson",
      minutes: 30,
      weekIndex: week,
      dayOffsetInWeek: 2,
    });
    if (week > 0) {
      tasks.push({
        id: buildId("t", base, String(i++)),
        title: `Review: prior ${targetSkill} material`,
        type: "review",
        minutes: 25,
        weekIndex: week,
        dayOffsetInWeek: 4,
      });
    }
    tasks.push({
      id: buildId("t", base, String(i++)),
      title: `Milestone: ${targetSkill} checkpoint`,
      type: "milestone",
      minutes: 20,
      weekIndex: week,
      dayOffsetInWeek: 5,
    });
  }
  return {
    summary: `A structured path for ${targetSkill} over ${w} week(s), mixing lessons, reviews, and milestones.`,
    phases: [
      { name: "Foundations", focus: "Build routine and core skills" },
      { name: "Build", focus: "Deeper practice" },
    ].slice(0, Math.min(2, w)),
    tasks,
  };
}

export async function generateSproutPlan(input: {
  targetSkill: string;
  deadline: Date;
  startDate: Date;
  initialResources: string[];
}): Promise<SproutPlan> {
  const days = Math.max(
    1,
    Math.ceil(
      (input.deadline.getTime() - input.startDate.getTime()) / (86400 * 1000)
    )
  );
  const weeks = Math.max(1, Math.ceil(days / 7));

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return fallbackPlan(input.targetSkill, input.initialResources, weeks);
  }

  const openai = new OpenAI({ apiKey: key });
  const userContent = JSON.stringify({
    targetSkill: input.targetSkill,
    startDate: input.startDate.toISOString().slice(0, 10),
    deadline: input.deadline.toISOString().slice(0, 10),
    weeks,
    initialResources: input.initialResources,
    requiredJsonShape: {
      summary: "string",
      phases: [{ name: "string", focus: "string" }],
      tasks: [
        {
          title: "string",
          type: "lesson | review | milestone",
          minutes: "number 15-90",
          weekIndex: "0..weeks-1",
          dayOffsetInWeek: "0-6",
        },
      ],
    },
  });

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) return fallbackPlan(input.targetSkill, input.initialResources, weeks);
    const parsed = planSchema.parse(JSON.parse(text));
    return {
      summary: parsed.summary,
      phases: parsed.phases,
      tasks: parsed.tasks.map((t, i) => ({
        ...t,
        id: t.id ?? buildId("t", String(i), t.title.slice(0, 8)),
      })),
    };
  } catch {
    return fallbackPlan(input.targetSkill, input.initialResources, weeks);
  }
}

export function supplementalResources(targetSkill: string): string[] {
  return [
    `Search: "${targetSkill} structured course" (video + exercises)`,
    `Communities: Reddit or Discord for ${targetSkill} learners`,
    `Reference docs or official guides for ${targetSkill}`,
  ];
}

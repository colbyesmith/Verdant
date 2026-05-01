/**
 * AI-powered NL plan editor (design Q7).
 *
 * `interpretEdit` calls the LLM with a compact view of the plan + upcoming
 * sessions, validates the response against a closed Zod union, and returns the
 * parsed ops. `applyEditOps` mutates the plan/schedule with deterministic
 * code + the same scoring packer used at plan creation.
 *
 * Caller should fall back to the regex parser in `nl-schedule.ts` if this
 * function returns `ok: false` (LLM unavailable, malformed, or out-of-union).
 */
import OpenAI from "openai";
import { z } from "zod";
import {
  EDIT_PLAN_MODEL,
  EDIT_PLAN_SYSTEM,
  EDIT_PLAN_TEMPERATURE,
  buildEditPlanUserPrompt,
} from "@/prompts/edit-plan";
import type { ScheduledSession, SproutPlan } from "@/types/plan";

export const editOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("extend_task"),
    taskId: z.string(),
    addMinutes: z.number().int().min(-90).max(90),
  }),
  z.object({
    op: z.literal("shift_week"),
    weekIndex: z.number().int().min(0).max(60),
    deltaDays: z.number().int().min(-90).max(90),
  }),
  z.object({
    op: z.literal("shift_phase"),
    phaseIndex: z.number().int().min(0).max(20),
    deltaDays: z.number().int().min(-90).max(90),
  }),
  z.object({
    op: z.literal("insert_task"),
    afterTaskId: z.string(),
    title: z.string().min(1).max(200),
    type: z.enum(["lesson", "review", "milestone"]),
    minutes: z.number().int().min(15).max(90),
    priority: z.enum(["core", "stretch"]).default("core"),
  }),
  z.object({
    op: z.literal("remove_task"),
    taskId: z.string(),
  }),
  z.object({
    op: z.literal("set_priority"),
    taskId: z.string(),
    priority: z.enum(["core", "stretch"]),
  }),
  z.object({
    op: z.literal("lock_session"),
    sessionId: z.string(),
    locked: z.boolean(),
  }),
  z.object({
    op: z.literal("add_blackout"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(200).optional(),
  }),
]);

export type EditOp = z.infer<typeof editOpSchema>;

const responseSchema = z.object({
  ops: z.array(editOpSchema).max(20),
  summary: z.string().max(400),
});

export type InterpretResult =
  | { ok: true; ops: EditOp[]; summary: string }
  | { ok: false; reason: string };

export async function interpretEdit(args: {
  request: string;
  plan: SproutPlan;
  schedule: ScheduledSession[];
  now: Date;
}): Promise<InterpretResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, reason: "no-api-key" };

  const planView = {
    phases: args.plan.phases.map((p) => ({ name: p.name, focus: p.focus })),
    tasks: args.plan.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      weekIndex: t.weekIndex,
      priority: t.priority,
    })),
  };
  const scheduleView = args.schedule
    .filter((s) => new Date(s.start) >= args.now)
    .slice(0, 40)
    .map((s) => ({
      id: s.id,
      planTaskId: s.planTaskId,
      title: s.title,
      start: s.start,
      locked: !!s.locked,
    }));

  const userContent = buildEditPlanUserPrompt({
    request: args.request,
    planView,
    scheduleView,
    todayIso: args.now.toISOString(),
  });

  try {
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.chat.completions.create({
      model: EDIT_PLAN_MODEL,
      temperature: EDIT_PLAN_TEMPERATURE,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EDIT_PLAN_SYSTEM },
        { role: "user", content: userContent },
      ],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) return { ok: false, reason: "empty-response" };
    const parsed = responseSchema.parse(JSON.parse(text));
    if (parsed.ops.length === 0) {
      return { ok: false, reason: parsed.summary || "no-ops" };
    }
    return { ok: true, ops: parsed.ops, summary: parsed.summary };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[interpretEdit] failing back to regex:", err);
    }
    return { ok: false, reason: "interpret-failed" };
  }
}

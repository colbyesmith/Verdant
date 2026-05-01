import { auth } from "@/auth";
import { generateSproutPlan, supplementalResources } from "@/lib/generate-sprout";
import { insertOrSkip } from "@/lib/google-calendar";
import { prisma } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/user";
import { packWithScoring } from "@/lib/scoring-pack";
import { getBusyIntervals } from "@/lib/calendar-read";
import { summarizeAvailability } from "@/lib/availability-summary";
import type { SproutPlan, TimeWindows } from "@/types/plan";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const TIMING = process.env.NODE_ENV !== "production";
function tick(label: string, t0: number): void {
  if (TIMING) console.log(`[plans.POST] ${label}: ${Date.now() - t0}ms`);
}

const createBody = z.object({
  targetSkill: z.string().min(1).max(200),
  deadline: z.string(),
  startDate: z.string().optional(),
  initialResources: z.array(z.string().min(1)).min(0).max(20),
  freeformNote: z.string().max(2000).optional(),
  replaceActive: z.boolean().optional().default(true),
});

export async function GET() {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plan = await prisma.learningPlan.findFirst({
    where: { userId: s.user.id, status: "active" },
  });
  return NextResponse.json({ plan });
}

const TOTAL_STEPS = 4;

export async function POST(request: Request) {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await request.json();
  const parsed = createBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { targetSkill, initialResources, replaceActive, freeformNote } = parsed.data;
  const deadline = new Date(parsed.data.deadline);
  const startDate = parsed.data.startDate
    ? new Date(parsed.data.startDate)
    : new Date();
  if (Number.isNaN(deadline.getTime()) || deadline <= startDate) {
    return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
  }

  const userId = s.user.id;
  const accessToken = (s as { accessToken?: string }).accessToken;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const t0 = Date.now();
      try {
        // Step 1: gather context (DB prefs + Google busy + archive existing plan).
        send({
          type: "progress",
          step: 1,
          of: TOTAL_STEPS,
          label: "peeking at your garden",
        });

        const archiveOrCheck = replaceActive
          ? prisma.learningPlan
              .updateMany({
                where: { userId, status: "active" },
                data: { status: "archived" },
              })
              .then(() => null as null | { error: string })
          : prisma.learningPlan
              .findFirst({ where: { userId, status: "active" } })
              .then((existing) =>
                existing
                  ? {
                      error:
                        "You already have an active plan. Set replaceActive or archive it first.",
                    }
                  : null
              );

        const [archiveCheck, pref, busyResult] = await Promise.all([
          archiveOrCheck,
          ensureUserPreferences(userId),
          getBusyIntervals({
            userId,
            accessToken,
            from: startDate,
            to: new Date(deadline.getTime() + 86_400_000),
          }),
        ]);
        tick("parallel(archive+prefs+busy)", t0);

        if (archiveCheck) {
          send({ type: "error", message: archiveCheck.error });
          return;
        }

        const timeWindows: TimeWindows = JSON.parse(
          pref.timeWindows || "{}"
        ) as TimeWindows;
        const maxM = pref.maxMinutesDay;
        const slotEffectiveness = JSON.parse(
          pref.slotEffectiveness || "{}"
        ) as Record<string, number>;
        const externalBusy = busyResult.intervals.filter((b) => !b.isVerdant);
        const days = Math.max(
          1,
          Math.ceil((deadline.getTime() - startDate.getTime()) / 86_400_000)
        );
        const weeks = Math.max(1, Math.ceil(days / 7));
        const availability = summarizeAvailability({
          startDate,
          weeks,
          timeWindows,
          busy: externalBusy,
          slotEffectiveness,
        });

        // Step 2: LLM — usually the longest step.
        send({
          type: "progress",
          step: 2,
          of: TOTAL_STEPS,
          label: "drafting growth phases",
        });
        const tLLM = Date.now();
        const sprout: SproutPlan = await generateSproutPlan({
          targetSkill,
          deadline,
          startDate,
          initialResources,
          availability,
          weeklyMinutesTarget: pref.weeklyMinutesTarget,
          freeformNote: freeformNote ?? null,
        });
        tick("generateSproutPlan", tLLM);

        // Step 3: pack tasks into the calendar.
        send({
          type: "progress",
          step: 3,
          of: TOTAL_STEPS,
          label: "weaving sessions into your calendar",
        });
        const recs = supplementalResources(targetSkill);
        const tPack = Date.now();
        const packResult = packWithScoring(sprout.tasks, {
          startDate,
          deadline,
          timeWindows,
          busy: externalBusy,
          maxMinutesPerDay: maxM,
          slotEffectiveness,
        });
        tick("packWithScoring", tPack);
        const schedule = packResult.schedule;

        // Step 4: persist. Calendar writes happen post-response via `after()`.
        send({
          type: "progress",
          step: 4,
          of: TOTAL_STEPS,
          label: "sealing the plan in your journal",
        });
        const tDb = Date.now();
        const plan = await prisma.learningPlan.create({
          data: {
            userId,
            title: `Sprout: ${targetSkill}`,
            targetSkill,
            deadline,
            startDate,
            initialResources: JSON.stringify(initialResources),
            planJson: JSON.stringify(sprout),
            scheduleJson: JSON.stringify(schedule),
            recommendations: JSON.stringify(recs),
            freeformNote: freeformNote ?? null,
            status: "active",
          },
        });
        tick("prisma.create", tDb);
        tick("total(before-response)", t0);

        send({
          type: "done",
          step: TOTAL_STEPS,
          of: TOTAL_STEPS,
          plan,
          sprout,
          schedule,
          recommendations: recs,
          overflow: packResult.overflow.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority ?? "core",
          })),
        });

        if (pref.calendarConnected && accessToken && schedule.length > 0) {
          const planId = plan.id;
          after(async () => {
            const tBg = Date.now();
            try {
              const synced = await Promise.all(
                schedule.map((sess) => insertOrSkip(accessToken, sess))
              );
              await prisma.learningPlan.update({
                where: { id: planId },
                data: { scheduleJson: JSON.stringify(synced) },
              });
              tick(`bg.calendarSync(${synced.length} sessions)`, tBg);
            } catch (err) {
              if (TIMING) console.warn("[plans.POST] bg calendar sync failed:", err);
            }
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Plan generation failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

import { auth } from "@/auth";
import { generateSproutPlan, supplementalResources } from "@/lib/generate-sprout";
import { insertOrSkip } from "@/lib/google-calendar";
import { prisma } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/user";
import { packWithScoring } from "@/lib/scoring-pack";
import { getBusyIntervals } from "@/lib/calendar-read";
import { summarizeAvailability } from "@/lib/availability-summary";
import type { SproutPlan, TimeWindows } from "@/types/plan";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json(
      { error: "Invalid deadline" },
      { status: 400 }
    );
  }

  if (replaceActive) {
    await prisma.learningPlan.updateMany({
      where: { userId: s.user.id, status: "active" },
      data: { status: "archived" },
    });
  } else {
    const existing = await prisma.learningPlan.findFirst({
      where: { userId: s.user.id, status: "active" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have an active plan. Set replaceActive or archive it first." },
        { status: 409 }
      );
    }
  }

  const pref = await ensureUserPreferences(s.user.id);
  const timeWindows: TimeWindows = JSON.parse(
    pref.timeWindows || "{}"
  ) as TimeWindows;
  const maxM = pref.maxMinutesDay;
  const slotEffectiveness = JSON.parse(
    pref.slotEffectiveness || "{}"
  ) as Record<string, number>;

  // Pull calendar busy + build availability summary for the planner LLM.
  const busyResult = await getBusyIntervals({
    userId: s.user.id,
    accessToken: s.accessToken,
    from: startDate,
    to: new Date(deadline.getTime() + 86_400_000),
  });
  const externalBusy = busyResult.intervals.filter((b) => !b.isVerdant);
  const days = Math.max(
    1,
    Math.ceil(
      (deadline.getTime() - startDate.getTime()) / 86_400_000
    )
  );
  const weeks = Math.max(1, Math.ceil(days / 7));
  const availability = summarizeAvailability({
    startDate,
    weeks,
    timeWindows,
    busy: externalBusy,
    slotEffectiveness,
  });

  const sprout: SproutPlan = await generateSproutPlan({
    targetSkill,
    deadline,
    startDate,
    initialResources: initialResources,
    availability,
    weeklyMinutesTarget: pref.weeklyMinutesTarget,
    freeformNote: freeformNote ?? null,
  });
  const recs = supplementalResources(targetSkill);
  const packResult = packWithScoring(sprout.tasks, {
    startDate,
    deadline,
    timeWindows,
    busy: externalBusy,
    maxMinutesPerDay: maxM,
    slotEffectiveness,
  });
  let schedule = packResult.schedule;

  const acc = (s as { accessToken?: string }).accessToken;
  const withCal = await Promise.all(
    schedule.map((sess) => (pref.calendarConnected ? insertOrSkip(acc, sess) : sess))
  );
  schedule = withCal;

  const plan = await prisma.learningPlan.create({
    data: {
      userId: s.user.id,
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
  return NextResponse.json({
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
}

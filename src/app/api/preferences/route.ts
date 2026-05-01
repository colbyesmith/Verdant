import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { defaultTimeWindowsJson } from "@/lib/default-preferences";
import { NextResponse } from "next/server";
import { z } from "zod";

const patch = z.object({
  timeWindows: z.record(z.string(), z.object({ start: z.string(), end: z.string() })).optional(),
  maxMinutesDay: z.number().min(20).max(300).optional(),
  weeklyMinutesTarget: z.number().int().min(30).max(3000).nullable().optional(),
  calendarConnected: z.boolean().optional(),
});

export async function GET() {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pref = await prisma.userPreference.findUnique({ where: { userId: s.user.id } });
  if (!pref) {
    const p = await prisma.userPreference.create({
      data: {
        userId: s.user.id,
        timeWindows: defaultTimeWindowsJson(),
        maxMinutesDay: 90,
      },
    });
    return NextResponse.json(p);
  }
  return NextResponse.json(pref);
}

export async function PATCH(request: Request) {
  const s = await auth();
  if (!s?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const b = await request.json().catch(() => ({}));
  const p = patch.safeParse(b);
  if (!p.success) {
    return NextResponse.json({ error: p.error.message }, { status: 400 });
  }
  const data: Record<string, string | number | boolean | null> = {};
  if (p.data.timeWindows) {
    data.timeWindows = JSON.stringify(p.data.timeWindows);
  }
  if (p.data.maxMinutesDay !== undefined) {
    data.maxMinutesDay = p.data.maxMinutesDay;
  }
  if (p.data.weeklyMinutesTarget !== undefined) {
    data.weeklyMinutesTarget = p.data.weeklyMinutesTarget;
  }
  if (p.data.calendarConnected !== undefined) {
    data.calendarConnected = p.data.calendarConnected;
  }
  const pref = await prisma.userPreference.upsert({
    where: { userId: s.user.id },
    create: {
      userId: s.user.id,
      timeWindows: p.data.timeWindows
        ? JSON.stringify(p.data.timeWindows)
        : defaultTimeWindowsJson(),
      maxMinutesDay: p.data.maxMinutesDay ?? 90,
    },
    update: data,
  });
  return NextResponse.json(pref);
}

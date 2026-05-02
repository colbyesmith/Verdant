import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/user";
import type { SproutPlan, ScheduledSession } from "@/types/plan";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO, differenceInCalendarDays, isSameDay } from "date-fns";
import { Sprout, CalendarIcon } from "@/components/verdant/art";
import { SproutCard } from "@/components/verdant/SproutCard";
import {
  TodayTimeline,
  type TimelineEvent,
} from "@/components/verdant/TodayTimeline";
import { displayTitle } from "@/lib/phase";

function timeOfDay(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

function classifyType(t: string): TimelineEvent["type"] {
  if (t === "review") return "verdant-review";
  if (t === "milestone") return "verdant-milestone";
  return "verdant-lesson";
}

export default async function DashboardPage() {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const plan = await prisma.learningPlan.findFirst({
    where: { userId: s.user.id, status: "active" },
  });
  const pref = await ensureUserPreferences(s.user.id);
  const calendarConnected = pref.calendarConnected;

  if (!plan) {
    return (
      <Shell>
        <div style={{ padding: "12px 36px 60px" }}>
          <div className="tag">welcome</div>
          <h1
            className="serif-display"
            style={{
              fontSize: 56,
              margin: "4px 0 6px",
              fontWeight: 400,
              letterSpacing: "-0.02em",
            }}
          >
            Good morning,{" "}
            <span style={{ fontStyle: "italic", color: "var(--moss-deep)" }}>
              {s.user.name?.split(" ")[0] || "friend"}
            </span>
            .
          </h1>
          <p
            className="hand"
            style={{ fontSize: 15, color: "var(--ink-soft)", margin: "0 0 28px" }}
          >
            no sprouts in the soil yet — let&apos;s plant your first.
          </p>
          <div
            className="dotted"
            style={{
              padding: 48,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              color: "var(--ink-faded)",
              maxWidth: 520,
            }}
          >
            <Sprout size={120} growth={0.05} mood="sleepy" />
            <div className="hand" style={{ fontSize: 18, color: "var(--ink-soft)" }}>
              an empty plot
            </div>
            <p
              style={{
                margin: 0,
                textAlign: "center",
                fontSize: 14,
                color: "var(--ink-faded)",
              }}
            >
              You don&apos;t have an active sprout yet. Plant a goal and we&apos;ll
              schedule it into your week.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/plan/new" className="btn primary">
                plant a sprout →
              </Link>
              {!calendarConnected && (
                <Link href="/settings#calendars" className="btn">
                  <CalendarIcon size={16} /> connect calendar
                </Link>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const sprout: SproutPlan = JSON.parse(plan.planJson) as SproutPlan;
  const schedule: ScheduledSession[] = JSON.parse(
    plan.scheduleJson || "[]"
  ) as ScheduledSession[];
  const completions = await prisma.taskCompletion.findMany({
    where: { planId: plan.id },
  });
  const doneIds = new Set(
    completions.filter((c) => c.completed).map((c) => c.taskId)
  );

  const totalTasks = sprout.tasks?.length || schedule.length || 1;
  const doneCount = sprout.tasks?.filter((t) => doneIds.has(t.id)).length || 0;
  const growth = Math.max(0.05, Math.min(1, doneCount / totalTasks));

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const deadline = new Date(plan.deadline);
  const daysToBloom = differenceInCalendarDays(deadline, now);

  // Today's events
  const todaySessions = schedule.filter((row) => isSameDay(parseISO(row.start), now));
  const events: TimelineEvent[] = todaySessions.map((row) => {
    const taskId =
      row.agenda && row.agenda.length > 0
        ? row.agenda[0].planTaskId
        : row.planTaskId;
    return {
      id: row.id,
      title: displayTitle(row.title, row.type),
      sprout: plan.title,
      type: classifyType(row.type),
      start: timeOfDay(row.start),
      end: timeOfDay(row.end),
      href: taskId ? `/plan/${plan.id}/session/${taskId}` : undefined,
    };
  });

  // up next: next future session today (or any next future)
  const futureToday = events
    .filter((e) => {
      const [h, m] = e.start.split(":").map(Number);
      return h * 60 + m >= nowMinutes;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const upNext = futureToday[0];

  // Upcoming for cards
  const upcomingCount = schedule.filter(
    (row) => parseISO(row.end) >= now
  ).length;

  // Tags from skill text
  const tags = (plan.targetSkill || plan.title)
    .split(/[\s,/–-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t.toLowerCase());

  // Weekly rhythm: count minutes per weekday across all schedule entries within +/- 7 days
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const dayMins = [0, 0, 0, 0, 0, 0, 0];
  for (const row of schedule) {
    const start = parseISO(row.start);
    const end = parseISO(row.end);
    const idx = (start.getDay() + 6) % 7; // Monday=0
    const diffDays = differenceInCalendarDays(start, weekStart);
    if (diffDays >= 0 && diffDays < 7) {
      dayMins[idx] += Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }
  }
  const maxMins = Math.max(140, ...dayMins);

  const niceDay = format(now, "EEEE, MMMM d");

  return (
    <Shell>
      <div style={{ padding: "12px 36px 60px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "end",
            gap: 24,
            marginBottom: 24,
          }}
        >
          <div>
            <div className="tag">{niceDay.toUpperCase()}</div>
            <h1
              className="serif-display"
              style={{
                fontSize: 56,
                margin: "4px 0 6px",
                fontWeight: 400,
                letterSpacing: "-0.02em",
              }}
            >
              Good morning,{" "}
              <span style={{ fontStyle: "italic", color: "var(--moss-deep)" }}>
                {s.user.name?.split(" ")[0] || "friend"}
              </span>
              .
            </h1>
            <p
              className="hand"
              style={{ fontSize: 15, color: "var(--ink-soft)", margin: 0 }}
            >
              {events.length === 0
                ? "no sessions on the plot today — a quiet day."
                : `${events.length} little ${events.length === 1 ? "thing" : "things"} in the soil today.`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {!calendarConnected && (
              <Link href="/settings#calendars" className="btn">
                <CalendarIcon size={16} /> connect calendar
              </Link>
            )}
            <Link href={`/plan/${plan.id}`} className="btn">
              <CalendarIcon size={16} /> open sprout
            </Link>
            <Link href="/plan/new" className="btn primary">
              + plant a sprout
            </Link>
          </div>
        </div>

        <TodayTimeline events={events} nowMinutes={nowMinutes} upNext={upNext} />

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h2
            className="serif-display"
            style={{
              fontSize: 36,
              margin: 0,
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            Your{" "}
            <span style={{ fontStyle: "italic", color: "var(--moss-deep)" }}>garden</span>
          </h2>
          <div className="hand" style={{ fontSize: 14, color: "var(--ink-faded)" }}>
            1 sprout growing · {upcomingCount} upcoming session
            {upcomingCount === 1 ? "" : "s"}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
        >
          <SproutCard
            href={`/plan/${plan.id}`}
            title={plan.title}
            summary={sprout.summary}
            growth={growth}
            daysToBloom={daysToBloom}
            tags={tags.length > 0 ? tags : ["learning"]}
            mood={growth < 0.2 ? "sleepy" : "happy"}
          />
          <Link
            href="/plan/new"
            className="dotted"
            style={{
              background: "transparent",
              padding: 24,
              minHeight: 320,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: "var(--ink-faded)",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "var(--paper-warm)",
                border: "1.5px dashed var(--ink-soft)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-fraunces)",
                fontSize: 36,
                color: "var(--ink-faded)",
              }}
            >
              +
            </div>
            <div className="hand" style={{ fontSize: 15, color: "var(--ink-soft)" }}>
              an empty plot
            </div>
            <div style={{ fontSize: 13 }}>plant something new</div>
          </Link>
        </div>

        {/* weekly rhythm */}
        <div style={{ marginTop: 36 }}>
          <h2
            className="serif-display"
            style={{ fontSize: 28, margin: "0 0 14px", fontWeight: 500 }}
          >
            This week&apos;s rhythm
          </h2>
          <div className="ink-card" style={{ padding: 22 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 14,
                alignItems: "end",
                height: 160,
              }}
            >
              {dayMins.map((mins, i) => {
                const heightPct = (mins / maxMins) * 100;
                const color =
                  mins >= 90
                    ? "var(--moss)"
                    : mins >= 50
                      ? "var(--fern)"
                      : "var(--sprout)";
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: 11,
                        color: "var(--ink-faded)",
                      }}
                    >
                      {Math.round(mins)}m
                    </div>
                    <div
                      style={{
                        width: "70%",
                        height: `${Math.max(2, heightPct)}%`,
                        background: mins === 0 ? "var(--paper-deep)" : color,
                        border: "1.5px solid var(--ink)",
                        borderRadius: "12px 12px 4px 4px",
                      }}
                    />
                    <div
                      style={{
                        fontFamily: "var(--font-fraunces)",
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      {dayLabels[i]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="hand"
              style={{
                marginTop: 12,
                fontSize: 14,
                color: "var(--ink-faded)",
                textAlign: "center",
              }}
            >
              the bigger leaves are days with more practice planned.
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

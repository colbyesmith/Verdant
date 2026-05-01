import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import type { PlanTask, ScheduledSession, SproutPlan } from "@/types/plan";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  TypeBadge,
  YouTubeBlock,
} from "@/components/verdant/SessionPrimitives";
import { ForestSprite } from "@/components/verdant/art";
import { StarRating } from "@/components/verdant/StarRating";
import { displayTitle, phaseForWeek, youtubeId } from "@/lib/phase";

function pickVideoFor(task: PlanTask, initialResources: string[]): string | null {
  if (task.resourceRef) {
    const id = youtubeId(task.resourceRef);
    if (id) return id;
  }
  for (const r of initialResources) {
    const id = youtubeId(r);
    if (id) return id;
  }
  return null;
}

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const { id, taskId } = await params;
  const plan = await prisma.learningPlan.findFirst({
    where: { id, userId: s.user.id },
  });
  if (!plan) notFound();

  const sprout: SproutPlan = JSON.parse(plan.planJson) as SproutPlan;
  const task = (sprout.tasks || []).find((t) => t.id === taskId);
  if (!task) notFound();

  const completion = await prisma.taskCompletion.findUnique({
    where: { planId_taskId: { planId: id, taskId } },
  });

  const phases = sprout.phases || [];
  const phaseIdx = phaseForWeek(task.weekIndex, phases.length);
  const phaseName = phases[phaseIdx]?.name || "Phase";

  const initialResources: string[] = JSON.parse(
    plan.initialResources || "[]"
  ) as string[];
  const videoId = pickVideoFor(task, initialResources);

  // Find the scheduled session this completion came from (for date display)
  const schedule: ScheduledSession[] = JSON.parse(
    plan.scheduleJson || "[]"
  ) as ScheduledSession[];
  const scheduledFor = schedule.find(
    (row) =>
      row.planTaskId === taskId ||
      row.agenda?.some((a) => a.planTaskId === taskId)
  );
  const ranOn = completion?.completedAt
    ? format(completion.completedAt, "EEE, MMM d")
    : scheduledFor
      ? format(parseISO(scheduledFor.start), "EEE, MMM d")
      : "—";

  const rating = completion?.rating ?? 0;
  const completed = Boolean(completion?.completed);

  return (
    <Shell>
      <div style={{ padding: "12px 36px 60px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/plan/${id}`}
            className="btn"
            style={{ fontSize: 14, paddingLeft: 14, paddingRight: 16, gap: 8 }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
            back to {plan.title}
          </Link>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-jetbrains)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            <Link
              href="/dashboard"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              my garden
            </Link>
            <span>/</span>
            <Link
              href={`/plan/${id}`}
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {plan.title}
            </Link>
            <span>/</span>
            <span>journal · {ranOn}</span>
          </div>
        </div>

        <div className="journal-edge" style={{ padding: 32, position: "relative" }}>
          <div
            className="tape"
            style={{ left: 60, top: -10, transform: "rotate(-3deg)" }}
          />
          <div
            className="tape"
            style={{ right: 32, top: -10, transform: "rotate(4deg)" }}
          />

          {/* hero */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 28,
              alignItems: "start",
              marginBottom: 24,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                  }}
                >
                  journaled · {ranOn}
                </span>
                <TypeBadge type={task.type} />
                <span className="chip">{phaseName}</span>
                <span className="chip moss">{task.minutes} min</span>
                {!completed && (
                  <span className="chip blush">not yet marked done</span>
                )}
              </div>
              <h1
                className="serif-display"
                style={{
                  fontSize: 40,
                  margin: "0 0 10px",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                {displayTitle(task.title, task.type)}
              </h1>
              <div
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-fraunces)",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "var(--ink-soft)",
                  }}
                >
                  how it landed:
                </div>
                <StarRating value={rating} size={26} />
                {rating === 0 && (
                  <span
                    className="hand"
                    style={{ fontSize: 13, color: "var(--ink-faded)" }}
                  >
                    not rated yet
                  </span>
                )}
              </div>
            </div>
            <div
              className="ink-card soft"
              style={{
                padding: 16,
                minWidth: 220,
                background: "var(--paper-warm)",
              }}
            >
              <div className="tag" style={{ marginBottom: 6 }}>
                nav
              </div>
              <Link
                href={`/plan/${id}`}
                className="btn sm"
                style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6 }}
              >
                ← back to sprout
              </Link>
              <Link
                href={`/plan/${id}/session/${taskId}`}
                className="btn sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                view lesson page →
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 28,
            }}
          >
            <div>
              <YouTubeBlock videoId={videoId} caption="the lesson you ran" />

              <div style={{ marginTop: 22 }}>
                <div className="tag" style={{ marginBottom: 6 }}>
                  your reflection
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 22, margin: "0 0 10px", fontWeight: 500 }}
                >
                  What you wrote
                </h3>
                <div
                  className="ink-card soft"
                  style={{
                    padding: 18,
                    background: "var(--paper)",
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent 0, transparent 28px, rgba(43,36,24,0.06) 28px, rgba(43,36,24,0.06) 29px)",
                    fontFamily: "var(--font-fraunces)",
                    fontSize: 16,
                    lineHeight: 1.75,
                    color: "var(--ink)",
                    minHeight: 116,
                  }}
                >
                  {task.description ? (
                    <>“{task.description}”</>
                  ) : (
                    <span
                      style={{
                        fontStyle: "italic",
                        color: "var(--ink-faded)",
                      }}
                    >
                      Nothing logged for this session yet — open the lesson page
                      to mark it done and rate it, then come back to write a
                      reflection.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                className="ink-card"
                style={{
                  padding: 16,
                  background: "var(--leaf-pale)",
                  position: "relative",
                }}
              >
                <div style={{ position: "absolute", left: -8, top: -16 }}>
                  <ForestSprite size={48} />
                </div>
                <div style={{ paddingLeft: 44 }}>
                  <div className="tag" style={{ marginBottom: 4 }}>
                    fern noticed
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-fraunces)",
                      fontSize: 14,
                      lineHeight: 1.45,
                      color: "var(--ink)",
                    }}
                  >
                    {rating >= 4
                      ? "Strong rating on this one — I'll bias future sessions toward this slot."
                      : rating > 0 && rating < 3
                        ? "Tougher session. I'll lighten the next one and re-introduce this material in a review."
                        : "No reflection yet. Even one sentence is worth catching for the next planning pass."}
                  </div>
                </div>
              </div>

              <div className="ink-card soft" style={{ padding: 14 }}>
                <div className="tag" style={{ marginBottom: 8 }}>
                  place in the journey
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-fraunces)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--ink-soft)",
                  }}
                >
                  <strong style={{ color: "var(--ink)" }}>{phaseName}</strong>{" "}
                  phase ·{" "}
                  <strong style={{ color: "var(--ink)" }}>{task.type}</strong>{" "}
                  session.{" "}
                  {scheduledFor
                    ? `Scheduled for ${format(parseISO(scheduledFor.start), "EEE, MMM d")}.`
                    : "Not yet on your calendar."}
                </div>
                <Link
                  href={`/plan/${id}`}
                  className="btn sm"
                  style={{ marginTop: 10 }}
                >
                  see the trail →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

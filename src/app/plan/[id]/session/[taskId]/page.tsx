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
  SessionSection,
} from "@/components/verdant/SessionPrimitives";
import { LeafSprig, Sprout } from "@/components/verdant/art";
import { displayTitle, phaseForWeek, youtubeId } from "@/lib/phase";
import { SessionControls } from "./SessionControls";

function pickVideoFor(
  task: PlanTask,
  initialResources: string[]
): { id: string | null; caption?: string } {
  if (task.resourceRef) {
    const id = youtubeId(task.resourceRef);
    if (id) return { id, caption: task.resourceRef };
  }
  for (const r of initialResources) {
    const id = youtubeId(r);
    if (id) return { id, caption: r };
  }
  return { id: null };
}

function whyCopyFor(type: PlanTask["type"]): string {
  if (type === "milestone") {
    return "Milestones gate phases — the plan won't ramp until you pass. Treat this like a check-in, not a final exam: you're proving the prior weeks have integrated into something you own.";
  }
  if (type === "review") {
    return "Reviews are how lessons stick. Spaced repetition is doing more for retention than the original lesson did. Don't skip — even a 10-minute pass keeps the prior week alive.";
  }
  return "Lessons add new material. Show up rested, watch the demo at half speed first, and finish with a single clean rep so your nervous system encodes the right pattern.";
}

function howStepsFor(task: PlanTask): string[] {
  if (task.description) {
    const split = task.description
      .split(/\n+|\.\s+(?=[A-Z])/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length >= 2) return split;
  }
  if (task.type === "milestone") {
    return [
      "Warm up fully — borrow from the warmup lesson in this phase.",
      "Set up your phone / film yourself.",
      "Run the milestone three times.",
      "Watch each take and rate yourself against the cues below.",
    ];
  }
  if (task.type === "review") {
    return [
      "Re-watch the original demo at full speed once.",
      "Re-watch at 0.5× and pause at the moment your form usually breaks.",
      "Note one thing in your journal — one cue, not three.",
    ];
  }
  return [
    `Set aside ${task.minutes} minutes — short rests, not long ones.`,
    "Watch the demo at half speed before standing up.",
    "Run through the drill, focusing on form before reps.",
    "Finish with one clean rep so your nervous system encodes the right pattern.",
  ];
}

export default async function SessionDetailPage({
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
  const tasks = sprout.tasks || [];
  const planTask = tasks.find((t) => t.id === taskId);

  // Schedule: when is this task happening?
  const schedule: ScheduledSession[] = JSON.parse(
    plan.scheduleJson || "[]"
  ) as ScheduledSession[];
  const scheduledFor = schedule.find(
    (row) =>
      row.planTaskId === taskId ||
      row.agenda?.some((a) => a.planTaskId === taskId)
  );

  // If the taskId isn't in planJson, look it up as a ReviewInstance.
  // FSRS-managed reviews live in their own table; we synthesize a PlanTask
  // shape so the rest of the rendering flow stays unchanged.
  let task: PlanTask;
  let isReview = false;
  let reviewState: { rating: number | null; completed: boolean } | null = null;
  let reviewParentLessonId: string | null = null;

  if (planTask) {
    task = planTask;
  } else {
    const ri = await prisma.reviewInstance.findUnique({
      where: { id: taskId },
      include: { lessonState: true },
    });
    if (!ri || ri.planId !== plan.id) notFound();
    isReview = true;
    reviewParentLessonId = ri.lessonState.lessonId;
    const parent = tasks.find((t) => t.id === ri.lessonState.lessonId);
    const parentTitle = parent?.title ?? "earlier lesson";
    const start = scheduledFor ? new Date(scheduledFor.start) : ri.dueAt;
    const startMs = start.getTime();
    const planStart = new Date(plan.startDate).getTime();
    const weekIndex = Math.max(
      0,
      Math.floor((startMs - planStart) / (7 * 86_400_000))
    );
    const dow = (start.getDay() + 6) % 7;
    task = {
      id: ri.id,
      title: `Review: ${parentTitle}`,
      type: "review",
      minutes: 15,
      weekIndex,
      dayOffsetInWeek: dow,
      description: parent?.description
        ? `Re-engage with: ${parent.description}`
        : `Pull up what you learned in "${parentTitle}" and rehearse the core idea.`,
      resourceRef: parent?.resourceRef,
      dueAt: ri.dueAt.toISOString(),
      priority: "core",
    };
    reviewState = {
      rating: ri.rating,
      completed: ri.completedAt != null,
    };
  }

  const phases = sprout.phases || [];
  const phaseIdx = phaseForWeek(task.weekIndex, phases.length);
  const phaseName = phases[phaseIdx]?.name || "Phase";

  const initialResources: string[] = JSON.parse(
    plan.initialResources || "[]"
  ) as string[];
  const video = pickVideoFor(task, initialResources);

  // sort all tasks by (weekIndex, dayOffsetInWeek) for ordering
  const sortedTasks = [...tasks].sort(
    (a, b) => a.weekIndex - b.weekIndex || a.dayOffsetInWeek - b.dayOffsetInWeek
  );
  const taskIndex = sortedTasks.findIndex((t) => t.id === taskId);

  // For reviews: surface the parent lesson if available.
  const reviewedLessons =
    task.type === "review"
      ? reviewParentLessonId
        ? tasks.filter((t) => t.id === reviewParentLessonId)
        : sortedTasks.filter(
            (t, i) =>
              i < taskIndex &&
              t.type === "lesson" &&
              phaseForWeek(t.weekIndex, phases.length) === phaseIdx
          )
      : [];

  // For milestones: every task before this in time (any type)
  const builtOn =
    task.type === "milestone" ? sortedTasks.filter((_, i) => i < taskIndex) : [];

  const completion = isReview
    ? null
    : await prisma.taskCompletion.findUnique({
        where: { planId_taskId: { planId: id, taskId } },
      });
  const initialDone = isReview ? Boolean(reviewState?.completed) : Boolean(completion?.completed);
  const initialRating = isReview
    ? reviewState?.rating && reviewState.rating >= 1
      ? reviewState.rating
      : 0
    : completion?.rating && completion.rating >= 1
      ? completion.rating
      : 0;

  const cueLines = task.type === "milestone"
    ? [
        "Form is unmistakable, not perfect.",
        "You can repeat it cold, two days in a row.",
        "You can describe what success felt like in one sentence.",
      ]
    : task.type === "review"
      ? ["Slower than the lesson", "One cue, not three", "Notes go in the journal"]
      : [
          "No pinch in the wrist / joint loaded by the drill",
          "Even tempo across reps",
          "End on a clean rep, not a tired one",
        ];

  return (
    <Shell>
      <div style={{ padding: "12px 36px 60px" }}>
        {/* prominent back + breadcrumb */}
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
            <span>{displayTitle(task.title, task.type)}</span>
          </div>
        </div>

        <div className="journal-edge" style={{ padding: 32, position: "relative" }}>
          <div
            className="tape"
            style={{ left: 32, top: -10, transform: "rotate(-4deg)" }}
          />

          {/* hero */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr",
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
                <TypeBadge type={task.type} />
                <span className="chip">{phaseName}</span>
                <span className="chip moss">{task.minutes} min</span>
                {task.type === "milestone" && (
                  <span className="chip sun">phase gate</span>
                )}
                {scheduledFor && (
                  <span className="chip">
                    {format(parseISO(scheduledFor.start), "EEE MMM d · h:mm a")}
                  </span>
                )}
                {initialDone && <span className="chip moss">done ✓</span>}
              </div>
              <h1
                className="serif-display"
                style={{
                  fontSize: 44,
                  margin: "0 0 10px",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.05,
                }}
              >
                {displayTitle(task.title, task.type)}
              </h1>
              <p
                style={{
                  fontFamily: "var(--font-fraunces)",
                  fontStyle: "italic",
                  fontSize: 16,
                  color: "var(--ink-soft)",
                  margin: 0,
                  maxWidth: 620,
                }}
              >
                part of{" "}
                <Link
                  href={`/plan/${id}`}
                  style={{
                    color: "var(--moss-deep)",
                    textDecoration: "underline",
                  }}
                >
                  {plan.title}
                </Link>
              </p>
            </div>
          </div>

          {/* sticky video on left, scrollable right */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr",
              gap: 28,
              alignItems: "start",
            }}
          >
            <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
              <YouTubeBlock videoId={video.id} caption={video.caption} />
              <div style={{ marginTop: 14 }}>
                <SessionControls
                  planId={id}
                  taskId={taskId}
                  taskType={task.type}
                  initialDone={initialDone}
                  initialRating={initialRating}
                />
              </div>
              <div
                className="ink-card soft"
                style={{
                  padding: 14,
                  marginTop: 14,
                  background: "var(--paper)",
                }}
              >
                <div className="tag" style={{ marginBottom: 6 }}>
                  fern&apos;s read
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-fraunces)",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    lineHeight: 1.45,
                  }}
                >
                  {task.type === "milestone"
                    ? "This is a checkpoint, not just a session. Bring full energy — film yourself. The next phase opens when you pass."
                    : task.type === "review"
                      ? "Don't skip this — the spaced repetition is doing more than the original lesson did."
                      : "First time on this drill? Watch the demo at half speed before you stand up."}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                minWidth: 0,
              }}
            >
              <SessionSection
                kicker="what it is"
                title="What"
                body={
                  task.description ||
                  `A ${task.minutes}-minute ${task.type} session in the ${phaseName} phase.`
                }
              />
              <SessionSection
                kicker="why it matters"
                title="Why"
                body={whyCopyFor(task.type)}
              />
              <div>
                <div className="tag" style={{ marginBottom: 6 }}>
                  how to do it
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 22, margin: "0 0 10px", fontWeight: 500 }}
                >
                  How
                </h3>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {howStepsFor(task).map((step, i) => (
                    <li
                      key={i}
                      className="ink-card soft"
                      style={{
                        padding: "10px 14px",
                        display: "flex",
                        gap: 14,
                        alignItems: "flex-start",
                        background: "var(--paper-warm)",
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: "var(--moss)",
                          color: "#f8f1de",
                          border: "1.5px solid var(--ink)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          fontFamily: "var(--font-fraunces)",
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-fraunces)",
                          fontSize: 15,
                          lineHeight: 1.45,
                          color: "var(--ink)",
                        }}
                      >
                        {step}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* cues */}
              <div
                className="ink-card"
                style={{
                  padding: 18,
                  background: "var(--leaf-pale)",
                  position: "relative",
                }}
              >
                <div className="tag" style={{ marginBottom: 8 }}>
                  cues to feel
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 20, margin: "0 0 10px", fontWeight: 500 }}
                >
                  What success feels like
                </h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {cueLines.map((c, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        fontFamily: "var(--font-fraunces)",
                        fontSize: 14,
                        lineHeight: 1.4,
                      }}
                    >
                      <span
                        style={{
                          marginTop: 4,
                          width: 8,
                          height: 8,
                          background: "var(--moss-deep)",
                          borderRadius: "50%",
                          flexShrink: 0,
                        }}
                      />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* review references */}
              {task.type === "review" && reviewedLessons.length > 0 && (
                <div
                  className="ink-card"
                  style={{ padding: 18, background: "var(--sky-soft)" }}
                >
                  <div className="tag" style={{ marginBottom: 6 }}>
                    reviewing these lessons
                  </div>
                  <h3
                    className="serif-display"
                    style={{ fontSize: 18, margin: "0 0 12px", fontWeight: 500 }}
                  >
                    What this is reinforcing
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {reviewedLessons.map((l) => (
                      <Link
                        key={l.id}
                        href={`/plan/${id}/session/${l.id}`}
                        className="ink-card soft"
                        style={{
                          padding: "10px 12px",
                          background: "var(--paper-warm)",
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <Sprout size={28} growth={0.55} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: 14,
                              fontFamily: "var(--font-fraunces)",
                            }}
                          >
                            {l.title}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-jetbrains)",
                              fontSize: 10,
                              color: "var(--ink-faded)",
                            }}
                          >
                            {l.minutes} min
                          </div>
                        </div>
                        <span style={{ color: "var(--ink-faded)", fontSize: 14 }}>
                          ›
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* milestone built on */}
              {task.type === "milestone" && builtOn.length > 0 && (
                <div
                  className="ink-card"
                  style={{ padding: 18, background: "var(--sun-soft)" }}
                >
                  <div className="tag" style={{ marginBottom: 6 }}>
                    built on
                  </div>
                  <h3
                    className="serif-display"
                    style={{ fontSize: 18, margin: "0 0 12px", fontWeight: 500 }}
                  >
                    Everything leading here
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 320,
                      overflowY: "auto",
                    }}
                  >
                    {builtOn.map((l, i) => (
                      <Link
                        key={l.id}
                        href={`/plan/${id}/session/${l.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px 1fr auto",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.5)",
                          border: "1.25px dashed var(--ink-soft)",
                          borderRadius: 8,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-jetbrains)",
                            fontSize: 11,
                            color: "var(--ink-faded)",
                          }}
                        >
                          {i + 1}.
                        </span>
                        <div>
                          <div
                            style={{
                              fontFamily: "var(--font-fraunces)",
                              fontSize: 14,
                              fontWeight: 500,
                            }}
                          >
                            {l.title}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-jetbrains)",
                              fontSize: 10,
                              color: "var(--ink-faded)",
                            }}
                          >
                            {l.type}
                          </div>
                        </div>
                        <span style={{ color: "var(--ink-faded)", fontSize: 14 }}>
                          ›
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily: "var(--font-fraunces)",
                      fontStyle: "italic",
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      lineHeight: 1.4,
                    }}
                  >
                    Don&apos;t skip the ones you skipped. Re-doing weak prior
                    sessions is the most reliable way to pass a milestone.
                  </div>
                </div>
              )}

              {/* sprigs (only for lessons with attached resources) */}
              {task.type === "lesson" && initialResources.length > 0 && (
                <div className="ink-card soft" style={{ padding: 14 }}>
                  <div className="tag" style={{ marginBottom: 6 }}>
                    sprigs you brought
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {initialResources.slice(0, 4).map((sp, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", gap: 10, alignItems: "center" }}
                      >
                        <LeafSprig size={24} />
                        <div
                          style={{
                            fontFamily: "var(--font-fraunces)",
                            fontSize: 14,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sp}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer back button — saves the user a scroll-up after working through
            the lesson content. Mirrors the top-of-page button. */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 28,
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
        </div>
      </div>
    </Shell>
  );
}

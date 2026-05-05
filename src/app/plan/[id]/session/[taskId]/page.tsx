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
import { OneTimeHint } from "@/components/verdant/OneTimeHint";
import { JournalBox } from "./JournalBox";

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
    return "Reviews are how lessons stick. Spaced repetition does more for retention than the original lesson did. Don't skip — even a short pass keeps the prior week alive.";
  }
  return "Lessons introduce new material. Show up with focus, engage with the source actively, and end the session with a concrete artifact — that's what makes it stick.";
}

function objectiveLabelFor(type: PlanTask["type"]): string {
  if (type === "milestone") return "your target";
  if (type === "review") return "your goal";
  return "your deliverable";
}

function objectiveTitleFor(type: PlanTask["type"]): string {
  if (type === "milestone") return "Target — what you must demonstrate";
  if (type === "review") return "Goal — what you're reinforcing";
  return "Deliverable — what you'll have at the end";
}

function objectiveFallback(task: PlanTask, parent?: PlanTask): string {
  if (task.type === "milestone") {
    return "Demonstrate the skill end-to-end on your own — without referencing the lessons that taught it. Treat any output as evidence the prior phase landed.";
  }
  if (task.type === "review") {
    if (parent?.objective) {
      return `Re-engage with the deliverable from "${parent.title}": ${parent.objective}`;
    }
    return "Reconstruct the prior lesson in your own words — without peeking — then check yourself against the source. Capture what didn't land the first time.";
  }
  return "Produce one concrete artifact you can point to: notes, a worked example, a clip, a diagram — something future-you can come back to.";
}

function howStepsFor(task: PlanTask, parent?: PlanTask): string[] {
  // 1) Explicit steps from the AI generator — always preferred.
  if (task.steps && task.steps.length >= 2) return task.steps;

  // 2) Reviews can borrow steps from the parent lesson, lightly reframed.
  if (task.type === "review" && parent?.steps && parent.steps.length >= 2) {
    return [
      `Re-engage with: "${parent.title}". Don't peek at the source yet.`,
      "From memory, sketch out the core idea or redo the deliverable in rough form.",
      "Compare your version to the original — circle the gaps, not the wins.",
      "Write what surprised you in the journal below.",
    ];
  }

  // 3) Description-as-steps: only when there are clearly multiple sentences.
  if (task.description) {
    const split = task.description
      .split(/\n+|\.\s+(?=[A-Z])/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length >= 2) return split;
  }

  // 4) Domain-agnostic fallback by type.
  if (task.type === "milestone") {
    return [
      `Carve out ${task.minutes} uninterrupted minutes and gather the materials you need.`,
      "Run through the target end-to-end on your own, without referencing the lessons.",
      "Repeat once more, then assess against the success criteria below.",
      "Capture what felt solid and what didn't in the journal.",
    ];
  }
  if (task.type === "review") {
    return [
      "Pull up the prior lesson — but don't open it yet.",
      "From memory, reconstruct the core idea or redo the deliverable in rough form.",
      "Check yourself against the source. Note where you drifted.",
      "Capture one new insight in the journal below.",
    ];
  }
  return [
    `Block out ${task.minutes} minutes with no interruptions and the source ready.`,
    "Engage actively — read, watch, or work through the source with notes in hand.",
    "Produce the deliverable, even a rough first pass. Get it on paper or screen.",
    "Note one thing that was sharper or fuzzier than expected in the journal.",
  ];
}

function successCriteriaFor(task: PlanTask, parent?: PlanTask): string[] {
  if (task.successCriteria && task.successCriteria.length > 0) {
    return task.successCriteria;
  }
  if (task.type === "review" && parent?.successCriteria && parent.successCriteria.length > 0) {
    return parent.successCriteria;
  }
  if (task.type === "milestone") {
    return [
      "You can do it end-to-end without consulting the prior lessons.",
      "Your output is consistent — not just one good run.",
      "You can describe in one sentence what changed since the start of the phase.",
    ];
  }
  if (task.type === "review") {
    return [
      "You can recall the core idea without consulting your notes.",
      "You noticed at least one thing that wasn't sharp the first time.",
      "You'd be comfortable being asked about this cold next week.",
    ];
  }
  return [
    "You finished the deliverable, even if it's rough.",
    "You can summarize the core idea in one sentence.",
    "You'd be ready to apply this in a real task tomorrow.",
  ];
}

function fernReadFor(type: PlanTask["type"]): string {
  if (type === "milestone") {
    return "This is a checkpoint, not just a session. Bring full focus — capture evidence (notes, a recording, a screenshot). The next phase opens when you pass.";
  }
  if (type === "review") {
    return "Don't skip this — the spaced repetition is doing more than the original lesson did.";
  }
  return "First pass on this material? Engage actively, not passively. End with the deliverable in hand, even if it's rough.";
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
  let parentLesson: PlanTask | undefined;

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
    parentLesson = tasks.find((t) => t.id === ri.lessonState.lessonId);
    const parentTitle = parentLesson?.title ?? "earlier lesson";
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
      description: parentLesson?.description
        ? `Re-engage with: ${parentLesson.description}`
        : `Pull up what you learned in "${parentTitle}" and rehearse the core idea.`,
      resourceRef: parentLesson?.resourceRef,
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

  const [completion, journalEntry] = await Promise.all([
    isReview
      ? Promise.resolve(null)
      : prisma.taskCompletion.findUnique({
          where: { planId_taskId: { planId: id, taskId } },
        }),
    prisma.taskJournal.findUnique({
      where: { planId_taskId: { planId: id, taskId } },
    }),
  ]);
  const initialDone = isReview ? Boolean(reviewState?.completed) : Boolean(completion?.completed);
  const initialRating = isReview
    ? reviewState?.rating && reviewState.rating >= 1
      ? reviewState.rating
      : 0
    : completion?.rating && completion.rating >= 1
      ? completion.rating
      : 0;

  const cueLines = successCriteriaFor(task, parentLesson);
  const howSteps = howStepsFor(task, parentLesson);
  const objectiveBody = task.objective || objectiveFallback(task, parentLesson);

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
                <OneTimeHint
                  storageKey="verdant.tooltip.session.dismissed"
                  emoji="🌱"
                >
                  When you finish a session, pick a rating first — then{" "}
                  <strong>mark done</strong> to commit it. Your rating teaches
                  Fern when you do your best work.
                </OneTimeHint>
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
                  {fernReadFor(task.type)}
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

              {/* Objective: deliverable / goal / target. The single most concrete
                  thing this session is for. Type-specific kicker + title. */}
              <div
                className="ink-card"
                style={{
                  padding: 18,
                  background:
                    task.type === "milestone"
                      ? "var(--sun-soft)"
                      : task.type === "review"
                        ? "var(--sky-soft)"
                        : "var(--leaf-pale)",
                  position: "relative",
                }}
              >
                <div className="tag" style={{ marginBottom: 6 }}>
                  {objectiveLabelFor(task.type)}
                </div>
                <h3
                  className="serif-display"
                  style={{ fontSize: 20, margin: "0 0 8px", fontWeight: 500 }}
                >
                  {objectiveTitleFor(task.type)}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-fraunces)",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {objectiveBody}
                </p>
              </div>

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
                  {howSteps.map((step, i) => (
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
                    Stuck on the milestone? The most reliable fix is going back
                    and re-running the weakest sessions above — not pushing
                    harder on the milestone itself.
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

              {/* Per-task journal — autosaves on blur + 1.5s debounce. Storage in
                  TaskJournal keyed by (planId, taskId). Works for synthesized
                  review tasks too (taskId is the ReviewInstance.id). */}
              <JournalBox
                planId={id}
                taskId={taskId}
                taskType={task.type}
                initialBody={journalEntry?.body ?? ""}
                initialUpdatedAt={journalEntry?.updatedAt?.toISOString() ?? null}
              />
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

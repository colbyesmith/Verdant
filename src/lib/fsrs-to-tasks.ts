/**
 * Adapter from FSRS-managed review state (Prisma `ReviewInstance` rows) into
 * the `PlanTask` shape consumed by the slot-scoring packer. Lets the packer
 * stay ignorant of FSRS — it just sees a unified task list with a `dueAt`
 * hint on review tasks.
 */
import type { ReviewInstance } from "@prisma/client";
import type { PlanTask } from "@/types/plan";

/** Default minutes for a single review session. Short enough to bundle. */
const REVIEW_MINUTES = 15;

export function reviewInstanceToTask(args: {
  review: ReviewInstance;
  lessonTitle: string;
}): PlanTask {
  return {
    id: args.review.id,
    title: `Review: ${args.lessonTitle}`,
    type: "review",
    minutes: REVIEW_MINUTES,
    weekIndex: 0,
    dayOffsetInWeek: 0,
    dueAt: args.review.dueAt.toISOString(),
    preferStandalone: false,
    priority: "core",
  };
}

/**
 * Combine plan tasks (lessons + milestones from `planJson`) with adapter-built
 * review tasks. Returns the unified list ready for the packer.
 */
export function mergeTasksWithReviews(args: {
  planTasks: PlanTask[];
  reviews: Array<{ review: ReviewInstance; lessonTitle: string }>;
}): PlanTask[] {
  const reviewTasks = args.reviews.map(reviewInstanceToTask);
  return [...args.planTasks, ...reviewTasks];
}

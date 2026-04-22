import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import type { ScheduledSession, SproutPlan } from "@/types/plan";
import { redirect, notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { PlanActions } from "./PlanActions";
import { SessionRow } from "./SessionRow";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const { id } = await params;
  const plan = await prisma.learningPlan.findFirst({
    where: { id, userId: s.user.id },
  });
  if (!plan) {
    notFound();
  }
  const sprout: SproutPlan = JSON.parse(plan.planJson) as SproutPlan;
  const schedule: ScheduledSession[] = JSON.parse(
    plan.scheduleJson || "[]"
  ) as ScheduledSession[];
  const recs: string[] = JSON.parse(
    plan.recommendations || "[]"
  ) as string[];
  const completions = await prisma.taskCompletion.findMany({ where: { planId: id } });
  const done = new Set(completions.filter((c) => c.completed).map((c) => c.taskId));
  const effByTask = Object.fromEntries(
    completions.map((c) => [c.taskId, c.effectiveness])
  ) as Record<string, number | null | undefined>;

  return (
    <Shell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">{plan.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{sprout.summary}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm">
            <p className="text-[var(--muted)]">Deadline</p>
            <p className="mt-1 text-lg">
              {format(new Date(plan.deadline), "PPP")}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4 text-sm">
            <p className="text-[var(--muted)]">Resources you gave</p>
            <p className="mt-1">
              {JSON.parse(plan.initialResources || "[]").length + " links or notes"}
            </p>
          </div>
        </div>
        {recs.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-sprout-200/90">Suggested next resources</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--muted)]">
              {recs.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h2 className="text-sm font-medium text-sprout-200/90">Scheduled sessions</h2>
          <ul className="mt-2 space-y-1">
            {schedule.map((row) => (
              <li key={row.id}>
                <SessionRow
                  planId={id}
                  taskId={row.planTaskId}
                  title={row.title}
                  start={row.start}
                  type={row.type}
                  completed={done.has(row.planTaskId)}
                  initialEffectiveness={effByTask[row.planTaskId] ?? null}
                />
              </li>
            ))}
          </ul>
        </div>
        <PlanActions planId={id} />
      </div>
    </Shell>
  );
}

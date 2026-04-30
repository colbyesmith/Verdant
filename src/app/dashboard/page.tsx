import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import type { SproutPlan, ScheduledSession } from "@/types/plan";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";

function formatSessionTimeRange(startIso: string, endIso: string): string {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${format(start, "EEE, MMM d · h:mm a")} – ${format(end, "h:mm a")}`;
  }
  return `${format(start, "PPp")} – ${format(end, "PPp")}`;
}

export default async function DashboardPage() {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const plan = await prisma.learningPlan.findFirst({
    where: { userId: s.user.id, status: "active" },
  });
  if (!plan) {
    return (
      <Shell>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Your dashboard</h1>
          <p className="text-[var(--muted)]">
            You do not have an active sprout yet. Create a plan from your goal and
            we&apos;ll schedule it into your week.
          </p>
          <Link
            href="/plan/new"
            className="inline-block rounded-lg bg-sprout-600 px-4 py-2 text-sm font-medium text-white hover:bg-sprout-500"
          >
            New sprout
          </Link>
        </div>
      </Shell>
    );
  }
  const sprout: SproutPlan = JSON.parse(plan.planJson) as SproutPlan;
  const schedule: ScheduledSession[] = JSON.parse(
    plan.scheduleJson || "[]"
  ) as ScheduledSession[];
  const upcoming = schedule
    .filter((x) => new Date(x.end) >= new Date())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, 6);
  return (
    <Shell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">{plan.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{sprout.summary}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
            <h2 className="text-sm font-medium text-sprout-200">Deadline</h2>
            <p className="mt-1 text-lg">
              {format(new Date(plan.deadline), "PPP")}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
            <h2 className="text-sm font-medium text-sprout-200">Upcoming</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {upcoming.length} session{upcoming.length === 1 ? "" : "s"} scheduled
            </p>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-sprout-200/90">Next sessions</h2>
          <ul className="space-y-2">
            {upcoming.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[#141210] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-sprout-50">{row.title}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatSessionTimeRange(row.start, row.end)} · {row.type}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-sprout-400/90">{row.type}</span>
              </li>
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No future sessions in this plan.</p>
            )}
          </ul>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/plan/${plan.id}`}
            className="rounded-lg border border-sprout-500/30 bg-sprout-500/10 px-4 py-2 text-sm font-medium text-sprout-200 hover:bg-sprout-500/20"
          >
            Open plan
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-sprout-200"
          >
            Time windows
          </Link>
        </div>
      </div>
    </Shell>
  );
}

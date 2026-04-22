import { Shell } from "@/components/Shell";
import Link from "next/link";

export default function Home() {
  return (
    <Shell>
      <div className="space-y-10 py-4">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-widest text-sprout-400/80">
            Executive summary
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-balance">
            A learning plan that fits work, life, and a changing calendar
          </h1>
          <p className="text-[var(--muted)] leading-relaxed">
            Verdant turns a vague goal—Korean, guitar, data—into a structured{" "}
            <em className="not-italic text-sprout-200">sprout</em>: lessons, reviews, and milestones
            placed in real calendar windows. When you give feedback, the schedule adapts.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            {
              t: "LLM + scheduling",
              d: "A learning sequence from your goal, resources, and deadline—then into open slots you define.",
            },
            {
              t: "Reschedule the whole week",
              d: "Miss a session? Verdant redistributes nearby instead of nudging a single event.",
            },
            {
              t: "What works, when",
              d: "Rate how effective a session felt; we learn which time slots you actually use well.",
            },
            {
              t: "Your calendar",
              d: "Connect Google, push sessions, and use natural language edits in the app.",
            },
          ].map((c) => (
            <li
              key={c.t}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4"
            >
              <h2 className="text-sm font-medium text-sprout-100">{c.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{c.d}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-sprout-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-sprout-900/20 hover:bg-sprout-500"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="text-sm text-[var(--muted)] hover:text-sprout-200"
          >
            Sign in with Google →
          </Link>
        </div>
      </div>
    </Shell>
  );
}

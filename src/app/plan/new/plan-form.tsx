"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewPlanForm() {
  const r = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const fd = new FormData(e.currentTarget);
    const targetSkill = String(fd.get("targetSkill") || "");
    const deadline = String(fd.get("deadline") || "");
    const resources = String(fd.get("resources") || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetSkill,
        deadline,
        initialResources: resources,
        replaceActive: true,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { plan?: { id: string }; error?: string };
    if (!res.ok) {
      setStatus("err");
      setError(j.error || res.statusText);
      return;
    }
    if (j.plan?.id) {
      r.push(`/plan/${j.plan.id}`);
    }
    setStatus("idle");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">What do you want to learn?</span>
        <input
          name="targetSkill"
          required
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          placeholder="Korean, guitar, Python data…"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Target date</span>
        <input
          name="deadline"
          type="date"
          required
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Starting resources (one per line)</span>
        <textarea
          name="resources"
          className="mt-1.5 w-full min-h-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          placeholder="A course link, a book, a channel…"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Workload and preferred times use your values from Settings (defaults if unset).
        After submit,         open your plan and use{" "}
        <span className="font-medium text-sprout-200/90">
          Add learning sessions to Google Calendar
        </span>{" "}
        to copy sessions into your primary Google calendar (sign in with Google). Add{" "}
        <code className="text-sprout-200/80">OPENAI_API_KEY</code> for AI-generated structure
        (template fallback when missing).
      </p>
      {error && <p className="text-sm text-rose-300/90">{error}</p>}
      <button
        type="submit"
        disabled={status === "saving"}
        className="w-full rounded-lg bg-sprout-600 py-2.5 text-sm font-medium text-white hover:bg-sprout-500 disabled:opacity-60"
      >
        {status === "saving" ? "Growing your sprout…" : "Generate plan"}
      </button>
    </form>
  );
}

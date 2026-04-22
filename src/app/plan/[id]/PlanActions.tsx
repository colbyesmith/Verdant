"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlanActions({ planId }: { planId: string }) {
  const r = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function nl() {
    setBusy(true);
    setErr(null);
    setMessage(null);
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naturalLanguage: text }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; plan?: unknown };
    if (!res.ok) {
      setErr(j.error || "Could not apply edit");
    } else {
      setMessage("Updated.");
      setText("");
      r.refresh();
    }
    setBusy(false);
  }

  async function resched() {
    setBusy(true);
    setErr(null);
    setMessage(null);
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rescheduleFrom: new Date().toISOString() }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || "Reschedule failed");
    } else {
      setMessage("Rebalanced from today to your deadline.");
      r.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
      <h2 className="text-sm font-medium text-sprout-200/90">Edit with natural language</h2>
      <p className="text-xs text-[var(--muted)]">
        Try: “make this week lighter”, “push to next week”, or “move tomorrow to Thursday
        night” (MVP phrasing is limited; extend in <code>nl-schedule.ts</code>).
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a change to your plan…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={nl}
          className="rounded-lg bg-sprout-600 px-4 py-2 text-sm font-medium text-white hover:bg-sprout-500 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={resched}
        className="w-full rounded-lg border border-[var(--border)] py-2 text-sm text-sprout-200 hover:bg-sprout-500/5 disabled:opacity-50"
      >
        Rebalance from today
      </button>
      {message && <p className="text-sm text-sprout-200/80">{message}</p>}
      {err && <p className="text-sm text-rose-300/90">{err}</p>}
    </div>
  );
}

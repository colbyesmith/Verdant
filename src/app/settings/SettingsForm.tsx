"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  maxMinutesDay: number;
  calendarConnected: boolean;
  timeWindows: string;
  defaultJson: string;
};

export function SettingsForm(p: Props) {
  const r = useRouter();
  const [max, setMax] = useState(p.maxMinutesDay);
  const [cal, setCal] = useState(p.calendarConnected);
  const [tw, setTw] = useState(
    p.timeWindows && p.timeWindows !== "{}" ? p.timeWindows : p.defaultJson
  );
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    setOk(false);
    let parsed: Record<string, { start: string; end: string }>;
    try {
      parsed = JSON.parse(tw) as Record<string, { start: string; end: string }>;
    } catch {
      setErr("Time windows must be valid JSON");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxMinutesDay: max,
        calendarConnected: cal,
        timeWindows: parsed,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || "Save failed");
    } else {
      setOk(true);
      r.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Max learning minutes per day</span>
        <input
          type="number"
          min={20}
          max={300}
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cal}
          onChange={(e) => setCal(e.target.checked)}
        />
        <span>
          Mark calendar as connected (we’ll create Google events on new plans when you
          sign in with calendar scope)
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Preferred time windows (JSON)</span>
        <textarea
          value={tw}
          onChange={(e) => setTw(e.target.value)}
          className="mt-1.5 w-full min-h-40 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-xs"
        />
      </label>
      {err && <p className="text-sm text-rose-300/90">{err}</p>}
      {ok && <p className="text-sm text-sprout-200/80">Saved.</p>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="w-full rounded-lg bg-sprout-600 py-2.5 text-sm font-medium text-white hover:bg-sprout-500"
      >
        {busy ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format, parseISO } from "date-fns";

type Props = {
  planId: string;
  taskId: string;
  title: string;
  start: string;
  type: string;
  completed: boolean;
  initialEffectiveness?: number | null;
};

export function SessionRow(p: Props) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(p.completed);
  const [eff, setEff] = useState<number | "">(
    p.initialEffectiveness && p.initialEffectiveness >= 1 && p.initialEffectiveness <= 5
      ? p.initialEffectiveness
      : ""
  );

  async function save() {
    setBusy(true);
    const body: { taskId: string; completed?: boolean; effectiveness?: number } = {
      taskId: p.taskId,
    };
    if (typeof eff === "number") {
      body.effectiveness = eff;
    }
    body.completed = done;
    await fetch(`/api/plans/${p.planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskFeedback: body }),
    });
    setBusy(false);
    r.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[#141210] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-sprout-50">{p.title}</p>
        <p className="text-xs text-[var(--muted)]">
          {format(parseISO(p.start), "PPp")} · {p.type}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-[var(--muted)]">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
          />
          Done
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[var(--muted)]">Effectiveness</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5"
            value={eff === "" ? "" : String(eff)}
            onChange={(e) => {
              const v = e.target.value;
              setEff(v ? Number(v) : "");
            }}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded border border-sprout-500/30 px-2 py-0.5 text-sprout-200 hover:bg-sprout-500/10 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

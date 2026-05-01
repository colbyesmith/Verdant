"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StarRating } from "@/components/verdant/StarRating";

export function SessionControls({
  planId,
  taskId,
  initialDone,
  initialEffectiveness,
}: {
  planId: string;
  taskId: string;
  initialDone: boolean;
  initialEffectiveness: number;
}) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [eff, setEff] = useState(initialEffectiveness);

  async function save(nextDone: boolean, nextEff: number) {
    setBusy(true);
    const body: { taskId: string; completed?: boolean; effectiveness?: number } = {
      taskId,
      completed: nextDone,
    };
    if (nextEff > 0) body.effectiveness = nextEff;
    await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskFeedback: body }),
    });
    setBusy(false);
    r.refresh();
  }

  return (
    <div
      className="ink-card soft"
      style={{
        padding: 14,
        background: done ? "var(--leaf-pale)" : "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="tag">tend this session</div>
      <button
        type="button"
        className={done ? "btn primary" : "btn"}
        onClick={() => {
          const next = !done;
          setDone(next);
          save(next, eff);
        }}
        disabled={busy}
        style={{ justifyContent: "center" }}
      >
        {done ? "marked done ✓" : "mark done"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-fraunces)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--ink-soft)",
          }}
        >
          how did it land?
        </span>
        <StarRating
          value={eff}
          onChange={(v) => {
            if (busy) return;
            setEff(v);
            save(done, v);
          }}
          size={20}
        />
      </div>
    </div>
  );
}

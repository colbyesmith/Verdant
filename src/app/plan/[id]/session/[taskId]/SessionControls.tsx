"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RatingButtons, type RatingValue } from "@/components/verdant/RatingButtons";
import type { TaskType } from "@/types/plan";

export function SessionControls({
  planId,
  taskId,
  taskType,
  initialDone,
  initialRating,
}: {
  planId: string;
  taskId: string;
  taskType: TaskType;
  initialDone: boolean;
  initialRating: number;
}) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [rating, setRating] = useState(initialRating);

  async function save(nextDone: boolean, nextRating: number) {
    setBusy(true);
    const body: { taskId: string; completed?: boolean; rating?: number } = {
      taskId,
      completed: nextDone,
    };
    if (nextRating > 0) body.rating = nextRating;
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
        gap: 12,
      }}
    >
      <div className="tag">tend this session</div>
      <button
        type="button"
        className={done ? "btn primary" : "btn"}
        onClick={() => {
          const next = !done;
          setDone(next);
          save(next, rating);
        }}
        disabled={busy}
        style={{ justifyContent: "center" }}
      >
        {done ? "marked done ✓" : "mark done"}
      </button>
      <RatingButtons
        value={rating || null}
        taskType={taskType}
        disabled={busy}
        onChange={(v: RatingValue) => {
          setRating(v);
          save(done, v);
        }}
      />
    </div>
  );
}

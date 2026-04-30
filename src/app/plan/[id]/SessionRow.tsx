"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format, parseISO } from "date-fns";

export type SessionTaskLine = {
  taskId: string;
  title: string;
  type: string;
  completed: boolean;
  initialEffectiveness?: number | null;
};

type Props = {
  planId: string;
  /** Combined session title (lists goals when multiple tasks share the block). */
  sessionTitle: string;
  start: string;
  lines: SessionTaskLine[];
  /** Set when this session exists as an event on Google Calendar */
  onCalendar?: boolean;
};

export function SessionRow(p: Props) {
  if (p.lines.length === 1) {
    const line = p.lines[0];
    return (
      <SingleTaskCard
        planId={p.planId}
        sessionTitle={p.sessionTitle}
        start={p.start}
        type={line.type}
        onCalendar={p.onCalendar}
        line={line}
      />
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[#141210] px-3 py-3">
      <div className="mb-3 border-b border-[var(--border)] pb-2">
        <p className="font-medium text-sprout-50">{p.sessionTitle}</p>
        <p className="text-xs text-[var(--muted)]">
          {format(parseISO(p.start), "PPp")}
          <span className="text-sprout-200/70">
            {" "}
            · one session · {p.lines.length} parts
          </span>
          {p.onCalendar ? (
            <span className="ml-2 text-sprout-400/90">· Calendar</span>
          ) : null}
        </p>
      </div>
      <ul className="space-y-3">
        {p.lines.map((line) => (
          <TaskLine key={line.taskId} planId={p.planId} line={line} />
        ))}
      </ul>
    </div>
  );
}

function SingleTaskCard({
  planId,
  sessionTitle,
  start,
  type,
  onCalendar,
  line,
}: {
  planId: string;
  sessionTitle: string;
  start: string;
  type: string;
  onCalendar?: boolean;
  line: SessionTaskLine;
}) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(line.completed);
  const [eff, setEff] = useState<number | "">(
    line.initialEffectiveness &&
      line.initialEffectiveness >= 1 &&
      line.initialEffectiveness <= 5
      ? line.initialEffectiveness
      : ""
  );

  async function save() {
    setBusy(true);
    const body: { taskId: string; completed?: boolean; effectiveness?: number } = {
      taskId: line.taskId,
    };
    if (typeof eff === "number") body.effectiveness = eff;
    body.completed = done;
    await fetch(`/api/plans/${planId}`, {
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
        <p className="font-medium text-sprout-50">{sessionTitle}</p>
        <p className="text-xs text-[var(--muted)]">
          {format(parseISO(start), "PPp")} · {type}
          {onCalendar ? <span className="ml-2 text-sprout-400/90">· Calendar</span> : null}
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

function TaskLine({
  planId,
  line,
}: {
  planId: string;
  line: SessionTaskLine;
}) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(line.completed);
  const [eff, setEff] = useState<number | "">(
    line.initialEffectiveness &&
      line.initialEffectiveness >= 1 &&
      line.initialEffectiveness <= 5
      ? line.initialEffectiveness
      : ""
  );

  async function save() {
    setBusy(true);
    const body: { taskId: string; completed?: boolean; effectiveness?: number } = {
      taskId: line.taskId,
    };
    if (typeof eff === "number") {
      body.effectiveness = eff;
    }
    body.completed = done;
    await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskFeedback: body }),
    });
    setBusy(false);
    r.refresh();
  }

  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-sprout-100">{line.title}</p>
        <p className="text-xs text-[var(--muted)]">{line.type}</p>
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
    </li>
  );
}

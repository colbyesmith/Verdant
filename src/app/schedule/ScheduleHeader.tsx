"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  weekOffset: number;
  label: string;
  calendarConnected: boolean;
  activePlanId: string | null;
}

export function ScheduleHeader({
  weekOffset,
  label,
  calendarConnected,
  activePlanId,
}: Props) {
  const r = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function syncToGoogle() {
    if (!activePlanId) return;
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/plans/${activePlanId}/calendar`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        syncedCount?: number;
        errors?: string[];
      };
      if (!res.ok) {
        setMsg("sync failed");
      } else {
        setMsg(
          j.syncedCount != null
            ? `synced ${j.syncedCount} session${j.syncedCount === 1 ? "" : "s"}`
            : "synced"
        );
        r.refresh();
      }
    } catch {
      setMsg("sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "end",
        gap: 24,
        marginBottom: 18,
      }}
    >
      <div>
        <div className="tag">week of</div>
        <h1
          className="serif-display"
          style={{
            fontSize: 44,
            margin: "4px 0 4px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Link
            href={`/schedule?w=${weekOffset - 1}`}
            aria-label="previous week"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 32,
              padding: 4,
              color: "var(--ink-faded)",
              textDecoration: "none",
            }}
          >
            ‹
          </Link>
          {label}
          <Link
            href={`/schedule?w=${weekOffset + 1}`}
            aria-label="next week"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 32,
              padding: 4,
              color: "var(--ink-faded)",
              textDecoration: "none",
            }}
          >
            ›
          </Link>
        </h1>
        <p
          style={{
            fontFamily: "var(--font-fraunces)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--ink-soft)",
            margin: 0,
          }}
        >
          {calendarConnected
            ? "click a session to open it · existing events shown for context"
            : "connect Google Calendar in settings to see your existing events"}
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {weekOffset !== 0 && (
          <Link href="/schedule" className="btn sm">
            today
          </Link>
        )}
        {activePlanId && (
          <button
            type="button"
            className="btn"
            onClick={syncToGoogle}
            disabled={syncing}
          >
            {syncing ? "syncing…" : "↻ sync to Google"}
          </button>
        )}
        {msg && (
          <span
            style={{
              fontFamily: "var(--font-fraunces)",
              fontStyle: "italic",
              fontSize: 13,
              color: "var(--ink-faded)",
            }}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

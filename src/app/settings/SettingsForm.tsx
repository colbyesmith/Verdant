"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, GoogleG, SunArt, WateringCan } from "@/components/verdant/art";

type Props = {
  maxMinutesDay: number;
  weeklyMinutesTarget: number | null;
  calendarConnected: boolean;
  timeWindows: string;
  defaultJson: string;
  userEmail?: string | null;
};

export function SettingsForm(p: Props) {
  const r = useRouter();
  const [max, setMax] = useState(p.maxMinutesDay);
  const [weekly, setWeekly] = useState<string>(
    p.weeklyMinutesTarget != null ? String(p.weeklyMinutesTarget) : ""
  );
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
    const trimmed = weekly.trim();
    let weeklyMinutesTarget: number | null = null;
    if (trimmed.length > 0) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 30 || n > 3000) {
        setErr("Weekly target must be between 30 and 3000 minutes");
        setBusy(false);
        return;
      }
      weeklyMinutesTarget = Math.round(n);
    }
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxMinutesDay: max,
        weeklyMinutesTarget,
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div className="ink-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <CalendarIcon size={28} />
          <div>
            <div className="tag">connections</div>
            <div
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              Calendars
            </div>
          </div>
        </div>
        <div
          className="ink-card soft"
          style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}
        >
          <GoogleG size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.userEmail || "Google account"}
            </div>
            <div className="tag">primary calendar</div>
          </div>
          <span className={cal ? "chip moss" : "chip"}>
            {cal ? "connected" : "off"}
          </span>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 14,
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={cal}
            onChange={(e) => setCal(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--moss)" }}
          />
          <span>connect Google Calendar (we&apos;ll create events for new sessions)</span>
        </label>
      </div>

      <div className="ink-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <WateringCan size={36} />
          <div>
            <div className="tag">pacing</div>
            <div
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              Daily limit
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-fraunces)",
            fontWeight: 500,
            fontSize: 28,
            color: "var(--moss-deep)",
            textAlign: "center",
          }}
        >
          {max} min/day
        </div>
        <input
          type="range"
          min={15}
          max={180}
          step={15}
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--moss)" }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span className="tag">15 min</span>
          <span className="tag">3 hr</span>
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="weekly">Weekly target (min)</label>
          <input
            id="weekly"
            type="number"
            min={30}
            max={3000}
            step={15}
            placeholder="auto (infer from windows)"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
          />
          <span className="hint">
            optional — fern paces plans toward this many minutes per week.
          </span>
        </div>
      </div>

      <div className="ink-card" style={{ padding: 20, gridColumn: "span 2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <SunArt size={36} />
          <div>
            <div className="tag">when can fern plant?</div>
            <div
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              Time windows
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tw">JSON ({"{ Mon: [{ start, end }], … }"})</label>
          <textarea
            id="tw"
            value={tw}
            onChange={(e) => setTw(e.target.value)}
            style={{
              minHeight: 220,
              fontFamily: "var(--font-jetbrains)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
          <span className="hint">
            keys are weekdays (Mon, Tue, …). fern only plants inside these windows.
          </span>
        </div>
      </div>

      <div style={{ gridColumn: "span 2", display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn primary"
          style={{ minWidth: 180, justifyContent: "center" }}
        >
          {busy ? "saving…" : "save settings"}
        </button>
        {ok && (
          <span
            className="hand"
            style={{ color: "var(--moss-deep)", fontSize: 14 }}
          >
            saved.
          </span>
        )}
        {err && (
          <span
            className="hand"
            style={{ color: "var(--berry)", fontSize: 14 }}
          >
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

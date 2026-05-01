"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sprout } from "@/components/verdant/art";
import { differenceInCalendarWeeks } from "date-fns";

// Whimsical ticker words — gerund-form so they read naturally as
// "fern is <word>…". Garden-flavored to match the rest of the app.
const WHIMSICAL_WORDS = [
  "sprouting",
  "germinating",
  "branching out",
  "rooting around",
  "blooming",
  "unfurling",
  "trellising",
  "mulching",
  "composting",
  "pruning",
  "photosynthesizing",
  "pollinating",
  "watering",
  "tending",
  "sowing",
  "whispering to the moss",
  "consulting the ferns",
  "gathering dewdrops",
  "counting petals",
  "measuring sunbeams",
  "untangling vines",
  "bottling sunlight",
  "befriending earthworms",
  "coaxing buds",
  "wrangling tendrils",
  "tracing rootlines",
  "whittling twigs",
  "knitting leaves",
  "brewing chlorophyll",
  "translating birdsong",
  "reading the rings",
  "tasting the breeze",
  "flirting with bees",
  "greeting the snails",
  "polishing acorns",
  "charming the soil",
  "humming to seedlings",
  "tickling the daisies",
  "chasing butterflies",
  "weaving sunlight",
];

interface Phase {
  step: number;
  of: number;
  label: string;
}

interface DoneEvent {
  type: "done";
  step: number;
  of: number;
  plan: { id: string };
}

interface ProgressEvent {
  type: "progress";
  step: number;
  of: number;
  label: string;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type StreamEvent = ProgressEvent | DoneEvent | ErrorEvent;

export function NewPlanForm() {
  const r = useRouter();
  const [skill, setSkill] = useState("");
  const [deadline, setDeadline] = useState("");
  const [resources, setResources] = useState<string[]>([""]);
  const [intensity, setIntensity] = useState(2);
  const [freeformNote, setFreeformNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "err">("idle");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [whimsy, setWhimsy] = useState(WHIMSICAL_WORDS[0]);
  const wordIdxRef = useRef(0);

  // Whimsical word ticker — picks a fresh word every ~700ms during saving.
  // Walks a shuffled cursor instead of pure random so users don't see repeats.
  useEffect(() => {
    if (status !== "saving") return;
    wordIdxRef.current = Math.floor(Math.random() * WHIMSICAL_WORDS.length);
    setWhimsy(WHIMSICAL_WORDS[wordIdxRef.current]);
    const id = setInterval(() => {
      wordIdxRef.current = (wordIdxRef.current + 1) % WHIMSICAL_WORDS.length;
      setWhimsy(WHIMSICAL_WORDS[wordIdxRef.current]);
    }, 700);
    return () => clearInterval(id);
  }, [status]);

  const weeks = useMemo(() => {
    if (!deadline) return null;
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(1, differenceInCalendarWeeks(d, new Date()));
  }, [deadline]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    setPhase({ step: 0, of: 4, label: "reading your goal" });
    const cleanResources = resources.map((x) => x.trim()).filter(Boolean);
    const noteTrimmed = freeformNote.trim();
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetSkill: skill,
        deadline,
        initialResources: cleanResources,
        freeformNote: noteTrimmed.length > 0 ? noteTrimmed : undefined,
        replaceActive: true,
      }),
    });

    // Pre-stream errors (auth/validation) come back as plain JSON.
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("err");
      setError(j.error || res.statusText);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setStatus("err");
      setError("Streaming response not supported in this browser.");
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let done: DoneEvent | null = null;

    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "progress") {
            setPhase({ step: ev.step, of: ev.of, label: ev.label });
          } else if (ev.type === "error") {
            setStatus("err");
            setError(ev.message);
            return;
          } else if (ev.type === "done") {
            setPhase({ step: ev.of ?? 4, of: ev.of ?? 4, label: "ready!" });
            done = ev;
          }
        }
      }
    } catch (err) {
      setStatus("err");
      setError(err instanceof Error ? err.message : "Connection lost.");
      return;
    }

    if (done?.plan?.id) {
      r.push(`/plan/${done.plan.id}`);
    } else {
      setStatus("err");
      setError("Plan generation finished without a plan id.");
    }
  }

  return (
    <div style={{ padding: "20px 36px 60px", display: "grid", placeItems: "start center" }}>
      <div className="journal-edge" style={{ width: "min(1100px, 100%)", padding: "40px 48px" }}>
        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 40 }}>
            <div>
              <div className="tag">plant a new sprout</div>
              <h2
                className="serif-display"
                style={{
                  fontSize: 32,
                  margin: "4px 0 6px",
                  fontWeight: 500,
                  fontVariationSettings: '"opsz" 144',
                }}
              >
                A goal worth tending
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-fraunces)",
                  fontStyle: "italic",
                  fontSize: 14,
                  color: "var(--ink-faded)",
                  margin: "0 0 22px",
                }}
              >
                the more specific the goal, the easier we can plot it.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="field">
                  <label htmlFor="skill">What do you want to learn?</label>
                  <input
                    id="skill"
                    name="targetSkill"
                    required
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                    placeholder="e.g. hold a 5-min coffee chat in Korean"
                  />
                  <span className="hint">be concrete — a thing you&apos;d recognize doing</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label htmlFor="deadline">By when?</label>
                    <input
                      id="deadline"
                      name="deadline"
                      type="date"
                      required
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                    <span className="hint">
                      {weeks ? `≈ ${weeks} week${weeks === 1 ? "" : "s"} from today` : "pick a deadline"}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="intensity">How intense?</label>
                    <select
                      id="intensity"
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                    >
                      <option value={1}>gentle — short daily nudges</option>
                      <option value={2}>steady — most weekdays</option>
                      <option value={3}>focused — daily deep work</option>
                    </select>
                    <span className="hint">we&apos;ll pace you, no burnout</span>
                  </div>
                </div>
                <div className="field">
                  <label>
                    Starting resources{" "}
                    <span className="tag" style={{ marginLeft: 6 }}>
                      optional
                    </span>
                  </label>
                  {resources.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 6 }}>
                      <input
                        value={r}
                        onChange={(e) => {
                          const c = [...resources];
                          c[i] = e.target.value;
                          setResources(c);
                        }}
                        placeholder="paste a video, course, book…"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() =>
                          setResources(resources.filter((_, j) => j !== i))
                        }
                        style={{ background: "var(--paper)" }}
                        aria-label="remove resource"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setResources([...resources, ""])}
                    style={{ alignSelf: "flex-start", background: "var(--paper)" }}
                  >
                    + add another
                  </button>
                  <span className="hint">
                    we&apos;ll suggest more once we see your phases
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="freeformNote">
                    Anything else fern should know?{" "}
                    <span className="tag" style={{ marginLeft: 6 }}>
                      optional
                    </span>
                  </label>
                  <textarea
                    id="freeformNote"
                    value={freeformNote}
                    onChange={(e) => setFreeformNote(e.target.value)}
                    placeholder="e.g. I learn faster in the morning but only have time at night; rusty so go gently the first week"
                    style={{ minHeight: 80 }}
                  />
                  <span className="hint">
                    fern reads this verbatim while drafting your plan.
                  </span>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={status === "saving"}
                  >
                    {status === "saving" ? "growing your plan…" : "✨ generate plan"}
                  </button>
                </div>
                {error && (
                  <p
                    style={{
                      fontFamily: "var(--font-fraunces)",
                      fontSize: 13,
                      color: "var(--berry)",
                      margin: 0,
                    }}
                  >
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="ink-card" style={{ padding: 20, position: "relative" }}>
                <div
                  className="tape"
                  style={{ right: 16, top: -10, transform: "rotate(4deg)" }}
                />
                <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
                  <Sprout
                    size={120}
                    growth={status === "saving" ? 0.4 : skill ? 0.2 : 0.05}
                    mood={skill ? "happy" : "sleepy"}
                  />
                </div>
                <div className="tag" style={{ textAlign: "center" }}>
                  preview
                </div>
                <h3
                  className="serif-display"
                  style={{
                    fontSize: 22,
                    margin: "6px 0 10px",
                    textAlign: "center",
                    fontWeight: 500,
                  }}
                >
                  {skill && weeks
                    ? `${skill} in ${weeks} week${weeks === 1 ? "" : "s"}`
                    : skill || "Your sprout, sleeping"}
                </h3>
                {status === "saving" && (
                  <div style={{ textAlign: "center", padding: "16px 8px" }}>
                    <div
                      style={{
                        fontFamily: "var(--font-fraunces)",
                        fontStyle: "italic",
                        fontSize: 14,
                        color: "var(--moss-deep)",
                        minHeight: 20,
                      }}
                    >
                      {phase?.label ?? "reading your goal"}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "var(--paper-deep)",
                          border: "1.25px solid var(--ink)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${
                              phase
                                ? Math.min(100, (phase.step / phase.of) * 100)
                                : 4
                            }%`,
                            background: "var(--moss)",
                            transition: "width .8s cubic-bezier(.4,.0,.2,1)",
                          }}
                        />
                      </div>
                    </div>
                    <div
                      key={whimsy}
                      style={{
                        marginTop: 12,
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: 11,
                        color: "var(--ink-faded)",
                        animation: "whimsy-fade .5s ease",
                        minHeight: 14,
                      }}
                    >
                      fern is {whimsy}…
                    </div>
                    <style>{`
                      @keyframes whimsy-fade {
                        from { opacity: 0; transform: translateY(2px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>
                  </div>
                )}
                {status !== "saving" && skill && weeks && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { name: "Foundations", body: "the basics, gently" },
                      { name: "Practice", body: "daily reps, scaffolded" },
                      { name: "Polish", body: "milestones and review" },
                    ].map((p, i) => (
                      <div
                        key={i}
                        className="ink-card soft"
                        style={{
                          padding: "8px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-jetbrains)",
                            fontWeight: 600,
                            fontSize: 12,
                            color: "var(--moss-deep)",
                            width: 60,
                          }}
                        >
                          phase {i + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: "var(--ink-faded)" }}>
                            {p.body}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div
                      style={{
                        fontFamily: "var(--font-fraunces)",
                        fontStyle: "italic",
                        textAlign: "center",
                        fontSize: 13,
                        color: "var(--ink-faded)",
                        marginTop: 4,
                      }}
                    >
                      fern will weave sessions into open patches.
                    </div>
                  </div>
                )}
              </div>
              {!skill && status !== "saving" && (
                <div
                  style={{
                    fontFamily: "var(--font-fraunces)",
                    fontStyle: "italic",
                    textAlign: "center",
                    marginTop: 14,
                    fontSize: 13,
                    color: "var(--ink-faded)",
                  }}
                >
                  fill in the form, then we&apos;ll
                  <br />
                  sketch a plan together.
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

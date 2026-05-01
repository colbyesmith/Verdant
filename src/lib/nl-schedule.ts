import { z } from "zod";
import type { ScheduledSession } from "@/types/plan";

type NlResult =
  | { ok: true; sessions: ScheduledSession[]; message: string }
  | { ok: false; error: string };

/** Returned with NL PATCH — HF runs on every edit when HF_API_TOKEN is set */
export type HfNlDiagnostic = {
  configured: boolean;
  /** Always true when token present (every NL edit hits HF) */
  called: boolean;
  /** Short excerpt of raw model output for debugging */
  rewrite: string | null;
  httpStatus?: number;
};

/** Model id for Hugging Face Inference Providers (OpenAI-compatible router). */
const HF_MODEL =
  process.env.HF_SCHEDULE_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";

/** OpenAI-style chat completions URL (HF Inference Providers). */
const HF_CHAT_URL =
  process.env.HF_CHAT_COMPLETIONS_URL?.trim() ||
  "https://router.huggingface.co/v1/chat/completions";

const HF_MAX_NEW_TOKENS = Math.min(
  8192,
  Math.max(
    512,
    Number.parseInt(process.env.HF_SCHEDULE_MAX_NEW_TOKENS || "4096", 10) || 4096
  )
);

const agendaItemSchema = z.object({
  planTaskId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["lesson", "review", "milestone"]),
  minutes: z.number().min(5).max(240),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  planTaskId: z.string().min(1),
  agenda: z.array(agendaItemSchema).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["lesson", "review", "milestone"]),
  calendarEventId: z.string().optional(),
  googleSynced: z.boolean().optional(),
});

const hfReplySchema = z.object({
  message: z.string().min(1),
  sessions: z.array(sessionSchema).min(1),
});

/**
 * Natural-language schedule editing: **always** calls Hugging Face Inference API
 * (when `HF_API_TOKEN` is set) and expects a JSON object `{ message, sessions }`.
 *
 * Rule-based parsing was removed — the model is responsible for interpreting
 * arbitrary phrasing into a full updated schedule.
 */
export async function applyNaturalLanguageEditSmart(
  text: string,
  sessions: ScheduledSession[],
  now: Date
): Promise<{ result: NlResult; hf: HfNlDiagnostic }> {
  const trimmed = text.trim();
  const token = process.env.HF_API_TOKEN?.trim();

  const hf: HfNlDiagnostic = {
    configured: Boolean(token),
    called: false,
    rewrite: null,
  };

  if (!trimmed) {
    return { result: { ok: false, error: "Empty message" }, hf };
  }
  if (sessions.length === 0) {
    return {
      result: { ok: false, error: "No sessions to edit in this plan." },
      hf,
    };
  }
  if (!token) {
    return {
      result: {
        ok: false,
        error:
          "Natural language editing requires HF_API_TOKEN in .env (Hugging Face). Add your token and restart the dev server.",
      },
      hf,
    };
  }

  hf.called = true;
  const { system, user } = buildChatMessages(trimmed, sessions, now);

  try {
    const res = await fetch(HF_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: HF_MAX_NEW_TOKENS,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    hf.httpStatus = res.status;

    const bodyText = await res.text();
    hf.rewrite = preview(bodyText, 900);

    let data: unknown = null;
    try {
      data = JSON.parse(bodyText) as unknown;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const apiErr = extractRouterErrorMessage(data);
      return {
        result: {
          ok: false,
          error: `Hugging Face error (HTTP ${res.status}). ${apiErr}. Use HF_CHAT_COMPLETIONS_URL (default router), HF_SCHEDULE_MODEL, and a token with Inference Providers permission.`,
        },
        hf,
      };
    }

    const rawText = extractChatCompletionText(data);
    if (rawText) hf.rewrite = preview(rawText, 900);

    if (!rawText) {
      return {
        result: {
          ok: false,
          error:
            "Model returned no text. Try a smaller schedule, a different HF_SCHEDULE_MODEL, or increase HF_SCHEDULE_MAX_NEW_TOKENS.",
        },
        hf,
      };
    }

    const parsed = parseModelJson(rawText);
    if (!parsed) {
      return {
        result: {
          ok: false,
          error:
            "Could not parse JSON from the model. Ask again, or switch to an instruction-tuned model via HF_SCHEDULE_MODEL.",
        },
        hf,
      };
    }

    const validated = hfReplySchema.safeParse(parsed);
    if (!validated.success) {
      return {
        result: {
          ok: false,
          error: `Model JSON did not match the required shape: ${validated.error.message}`,
        },
        hf,
      };
    }

    const normalized = validated.data.sessions
      .map((s) => stripCalendarSync(s as ScheduledSession))
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));

    const sanity = validateScheduleSanity(normalized);
    if (!sanity.ok) {
      return { result: { ok: false, error: sanity.error }, hf };
    }

    return {
      result: {
        ok: true,
        sessions: normalized,
        message: validated.data.message.trim(),
      },
      hf,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      result: {
        ok: false,
        error: `Natural language request failed: ${msg}`,
      },
      hf,
    };
  }
}

function buildChatMessages(
  userRequest: string,
  sessions: ScheduledSession[],
  now: Date
): { system: string; user: string } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const scheduleJson = JSON.stringify(sessions, null, 2);

  const system = [
    "You are Verdant, a scheduling assistant. Reply with ONLY one JSON object and nothing else.",
    "No markdown fences. No commentary before or after the JSON.",
    "",
    "Shape:",
    '{"message":"<short summary of edits>","sessions":[ ... ]}',
    "",
    "Each session MUST match:",
    "{ id: string; planTaskId: string; title: string; type: 'lesson'|'review'|'milestone'; start: ISO string; end: ISO string;",
    "  agenda?: Array<{ planTaskId: string; title: string; type: string; minutes: number }> }",
    "",
    "Rules:",
    "- Interpret the user's request freely (moves, swaps, shorten/lengthen, skip days, conflicts, rebalance).",
    "- Preserve id and planTaskId whenever possible so the app stays consistent.",
    "- End time must be strictly after start time. Minimum duration 15 minutes.",
    "- Sort sessions chronologically by start in your output.",
    "- Omit calendarEventId / googleSynced from output (they will be cleared server-side).",
  ].join("\n");

  const user = [
    `Server now (ISO): ${now.toISOString()}`,
    `Server timezone: ${tz}`,
    "",
    "Current schedule JSON:",
    scheduleJson,
    "",
    "User request:",
    userRequest.trim(),
  ].join("\n");

  return { system, user };
}

function extractChatCompletionText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };
  const c = o.choices?.[0]?.message?.content;
  if (typeof c === "string" && c.trim()) return c.trim();
  if (typeof o.error?.message === "string") return o.error.message;
  return null;
}

function extractRouterErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Non-JSON response (wrong URL or HTML error page)";
  const o = data as { error?: { message?: string } | string; message?: string };
  if (typeof o.error === "string") return o.error;
  if (o.error && typeof o.error === "object" && typeof o.error.message === "string") {
    return o.error.message;
  }
  if (typeof o.message === "string") return o.message;
  return "Unknown error";
}

function parseModelJson(raw: string): unknown | null {
  const cleaned = raw.replace(/[\u201c\u201d]/g, '"').trim();
  const slice = extractFirstJsonObject(cleaned);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stripCalendarSync(s: ScheduledSession): ScheduledSession {
  const copy = { ...s };
  delete copy.calendarEventId;
  copy.googleSynced = false;
  return copy;
}

function validateScheduleSanity(sessions: ScheduledSession[]): { ok: true } | { ok: false; error: string } {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (ids.has(s.id)) return { ok: false, error: `Duplicate session id: ${s.id}` };
    ids.add(s.id);
    const a = +new Date(s.start);
    const b = +new Date(s.end);
    if (!(b > a)) return { ok: false, error: `Invalid start/end for session ${s.id}` };
    const mins = Math.floor((b - a) / 60000);
    if (mins < 15) return { ok: false, error: `Session ${s.id} is shorter than 15 minutes` };
  }
  return { ok: true };
}

function preview(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

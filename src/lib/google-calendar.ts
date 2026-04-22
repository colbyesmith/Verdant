import type { ScheduledSession } from "@/types/plan";

const CAL_PRIMARY = "primary";

/**
 * Create a Google Calendar event. Requires
 * https://www.googleapis.com/auth/calendar.events
 */
export async function syncSessionToGoogle(
  accessToken: string,
  session: ScheduledSession
): Promise<{ id: string }> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      CAL_PRIMARY
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: session.title,
        start: { dateTime: session.start, timeZone },
        end: { dateTime: session.end, timeZone },
        description: "Verdant sprout session",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar: ${res.status} ${err}`);
  }
  const j = (await res.json()) as { id: string };
  return { id: j.id };
}

export async function insertOrSkip(
  accessToken: string | undefined,
  session: ScheduledSession
): Promise<ScheduledSession> {
  if (!accessToken) {
    return { ...session, googleSynced: false };
  }
  try {
    const { id } = await syncSessionToGoogle(accessToken, session);
    return { ...session, calendarEventId: id, googleSynced: true };
  } catch {
    return { ...session, googleSynced: false };
  }
}

import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { ensureUserPreferences } from "@/lib/user";
import { DEFAULT_TIME_WINDOWS } from "@/lib/default-preferences";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { SectionTitle } from "@/components/verdant/SectionTitle";

export default async function SettingsPage() {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const pref = await ensureUserPreferences(s.user.id);
  return (
    <Shell>
      <div style={{ padding: "12px 36px 60px", display: "grid", placeItems: "start center" }}>
        <div style={{ width: "min(920px, 100%)" }}>
          <SectionTitle kicker="settings">Tend the soil</SectionTitle>
          <p
            style={{
              fontFamily: "var(--font-fraunces)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--ink-faded)",
              margin: "0 0 22px",
            }}
          >
            time windows and the daily cap shape every plan we plot.
          </p>
          <SettingsForm
            maxMinutesDay={pref.maxMinutesDay}
            weeklyMinutesTarget={pref.weeklyMinutesTarget}
            pushToCalendar={pref.pushToCalendar}
            timeWindows={pref.timeWindows}
            defaultJson={JSON.stringify(DEFAULT_TIME_WINDOWS, null, 2)}
            userEmail={s.user.email}
          />
        </div>
      </div>
    </Shell>
  );
}

import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { ensureUserPreferences } from "@/lib/user";
import { DEFAULT_TIME_WINDOWS } from "@/lib/default-preferences";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  const pref = await ensureUserPreferences(s.user.id);
  return (
    <Shell>
      <div className="mx-auto max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Time windows and daily cap apply when we place sessions. JSON keys are weekday
          (0=Sun–6=Sat) with <code className="text-sprout-200/80">start</code> /{" "}
          <code className="text-sprout-200/80">end</code> (24h).
        </p>
        <div className="pt-2">
          <SettingsForm
            maxMinutesDay={pref.maxMinutesDay}
            calendarConnected={pref.calendarConnected}
            timeWindows={pref.timeWindows}
            defaultJson={JSON.stringify(DEFAULT_TIME_WINDOWS, null, 2)}
          />
        </div>
      </div>
    </Shell>
  );
}

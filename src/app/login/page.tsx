import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { GoogleSignIn } from "./sign-in";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const s = await auth();
  if (s?.user) {
    redirect("/dashboard");
  }
  const hasGoogle = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );
  return (
    <Shell>
      <div className="max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-[var(--muted)]">
          Use your Google account. We request calendar event access so you can add sprout
          sessions when you connect it in settings.
        </p>
        {!hasGoogle && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100/90">
            Set <code className="text-amber-200">AUTH_GOOGLE_ID</code> and{" "}
            <code className="text-amber-200">AUTH_GOOGLE_SECRET</code> in{" "}
            <code className="text-amber-200">.env</code> (from Google Cloud Console OAuth).
          </p>
        )}
        <GoogleSignIn disabled={!hasGoogle} />
      </div>
    </Shell>
  );
}

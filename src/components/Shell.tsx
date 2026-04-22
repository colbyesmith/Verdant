import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "./SignOutButton";

export async function Shell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={session ? "/dashboard" : "/"} className="text-lg font-semibold tracking-tight text-sprout-200">
            Verdant
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[var(--muted)]">
            {session ? (
              <>
                <Link href="/dashboard" className="hover:text-sprout-200">
                  Dashboard
                </Link>
                <Link href="/plan/new" className="hover:text-sprout-200">
                  New sprout
                </Link>
                <Link href="/settings" className="hover:text-sprout-200">
                  Settings
                </Link>
                <SignOutButton />
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-sprout-600 px-3 py-1.5 text-white hover:bg-sprout-500"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

"use client";

import { signIn } from "next-auth/react";

export function GoogleSignIn({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="font-semibold" aria-hidden>
        G
      </span>
      Continue with Google
    </button>
  );
}

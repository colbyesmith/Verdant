"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-xs text-[var(--muted)] hover:text-sprout-200"
    >
      Sign out
    </button>
  );
}

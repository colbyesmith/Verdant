"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      style={{
        background: "transparent",
        border: "none",
        fontFamily: "var(--font-jetbrains)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ink-faded)",
        cursor: "pointer",
      }}
    >
      sign out
    </button>
  );
}

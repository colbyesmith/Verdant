"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout } from "./art";

type Item = { href: string; label: string; match?: (p: string) => boolean };

export function PrimaryNav({
  signedIn,
  user,
}: {
  signedIn: boolean;
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}) {
  const pathname = usePathname();

  const items: Item[] = signedIn
    ? [
        { href: "/dashboard", label: "My garden" },
        { href: "/plan/new", label: "Plant a sprout" },
        { href: "/settings", label: "Settings" },
      ]
    : [];

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const initial = (user?.name || user?.email || "M")[0]?.toUpperCase() || "M";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 36px",
        position: "relative",
        zIndex: 5,
      }}
    >
      <Link
        href={signedIn ? "/dashboard" : "/"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
        }}
      >
        <Sprout size={48} growth={0.7} />
        <span
          style={{
            fontFamily: "var(--font-caveat)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--moss-deep)",
          }}
        >
          Verdant
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                background: active ? "var(--paper-warm)" : "transparent",
                border: active ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                borderRadius: 999,
                padding: "8px 16px",
                fontFamily: "var(--font-fraunces)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--ink)",
                boxShadow: active ? "2px 2px 0 var(--ink)" : "none",
                textDecoration: "none",
              }}
            >
              {it.label}
            </Link>
          );
        })}
        {signedIn ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginLeft: 16,
              paddingLeft: 16,
              borderLeft: "1.5px dashed var(--ink-soft)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--sun-soft)",
                border: "1.5px solid var(--ink)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-fraunces)",
                fontWeight: 600,
                fontSize: 14,
                color: "var(--ink)",
                overflow: "hidden",
              }}
            >
              {user?.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={36}
                  height={36}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initial
              )}
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {user?.name?.split(" ")[0] || "Friend"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  fontFamily: "var(--font-jetbrains)",
                }}
              >
                {user?.email || ""}
              </div>
            </div>
          </div>
        ) : (
          <Link href="/login" className="btn primary sm">
            sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

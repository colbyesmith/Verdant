import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { TaskType } from "@/types/plan";
import { Frog, Mushroom, Sprout } from "@/components/verdant/art";
import { StarRating } from "@/components/verdant/StarRating";
import { displayTitle } from "@/lib/phase";

function ToneCreature({ type, size = 36 }: { type: TaskType; size?: number }) {
  if (type === "review") return <Frog size={size} />;
  if (type === "milestone") return <Mushroom size={size} />;
  return <Sprout size={size} growth={0.5} />;
}

function toneBg(type: TaskType) {
  if (type === "review") return "var(--sky-soft)";
  if (type === "milestone") return "var(--sun-soft)";
  return "var(--leaf-pale)";
}

export function RoadAheadRow({
  href,
  title,
  type,
  start,
  rating = 0,
  done,
}: {
  href: string;
  title: string;
  type: TaskType;
  start: string;
  rating?: number;
  done: boolean;
}) {
  const startDate = parseISO(start);
  return (
    <Link
      href={href}
      className="ink-card soft"
      style={{
        display: "grid",
        gridTemplateColumns: "44px 96px 1fr auto auto",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        background: done ? "var(--paper-deep)" : "var(--paper-warm)",
        opacity: done ? 0.75 : 1,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <ToneCreature type={type} />
      <div
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: 12,
          color: "var(--ink-faded)",
          lineHeight: 1.2,
        }}
      >
        <div>{format(startDate, "EEE")}</div>
        <div>{format(startDate, "h:mm a")}</div>
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: 16,
            fontWeight: 500,
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {displayTitle(title, type)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span className="chip" style={{ background: toneBg(type) }}>
            {type}
          </span>
          {done && <span className="chip moss">done</span>}
        </div>
      </div>
      <StarRating value={rating} size={16} />
      <span style={{ color: "var(--ink-faded)", fontSize: 16 }}>›</span>
    </Link>
  );
}

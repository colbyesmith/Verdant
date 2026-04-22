import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function NotFound() {
  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-[var(--muted)]">That page does not exist.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sprout-200">
        ← Back to dashboard
      </Link>
    </Shell>
  );
}

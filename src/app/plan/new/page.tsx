import { auth } from "@/auth";
import { Shell } from "@/components/Shell";
import { NewPlanForm } from "./plan-form";
import { redirect } from "next/navigation";

export default async function NewPlanPage() {
  const s = await auth();
  if (!s?.user?.id) {
    redirect("/login");
  }
  return (
    <Shell>
      <div className="mx-auto max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold">New sprout</h1>
        <p className="text-sm text-[var(--muted)]">
          One active plan in the MVP. Creating a new sprout archives your current one.
        </p>
        <div className="pt-4">
          <NewPlanForm />
        </div>
      </div>
    </Shell>
  );
}

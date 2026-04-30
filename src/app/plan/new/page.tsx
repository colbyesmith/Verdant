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
      <NewPlanForm />
    </Shell>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { OnboardingFlow } from "@/components/app/onboarding-flow";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/");
  return (
    <OnboardingFlow
      user={{
        fullName: user.fullName,
        roleLabel: ROLE_LABELS[user.role],
        teamName: user.team?.name ?? null,
        signIn: user.kind === "password" ? `Username ${user.username ?? user.email}` : `Google · ${user.email}`,
      }}
    />
  );
}

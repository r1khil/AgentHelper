"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { signOut } from "@/lib/actions/auth";
import type { ActionResult } from "@/lib/actions/holdings";
import { BOUNDARY_HOOT_DOES, BOUNDARY_YOU_DO, LEARNING_BOUNDARY, ONBOARDING_STEPS, TOUR_CARDS } from "@/lib/onboarding";
import { OwlMark } from "@/components/app/owl-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** `teamName` is the sector team; `fundWide` is set for execs and admins, who have none and see every team. */
export type OnboardingUser = { fullName: string; roleLabel: string; teamName: string | null; fundWide: boolean; signIn: string };

/**
 * First-sign-in setup: the steps down the left, one step at a time on the right. The last step is the learning boundary,
 * and only it submits (the name typed on step 2 and the acknowledgement travel as hidden fields).
 */
export function OnboardingFlow({ user }: { user: OnboardingUser }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(user.fullName);
  const [acknowledged, setAcknowledged] = useState(false);
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await completeOnboarding(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "You're set up");
      router.replace("/");
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);

  const current = ONBOARDING_STEPS[step];
  const nameOk = fullName.trim().length > 0;
  const total = ONBOARDING_STEPS.length;
  const team = user.teamName ?? (user.fundWide ? "Fund-wide" : "No team yet");

  return (
    <div className="flex min-h-screen bg-background">
      <aside aria-label="Steps" className="flex w-80 shrink-0 flex-col border-r bg-band px-8 py-10">
        <div className="flex items-center gap-2.5">
          <OwlMark className="size-7 rounded-full" />
          <span className="text-body font-semibold">Owl Fund</span>
        </div>
        <ol className="mt-10 flex flex-col gap-1" aria-label="Setup steps">
          {ONBOARDING_STEPS.map((s, i) => {
            const done = i < step;
            const cur = i === step;
            return (
              <li key={s.id} aria-current={cur ? "step" : undefined} className={cn("flex h-10 items-center gap-3 text-body", cur ? "font-semibold text-foreground" : "text-ink-2")}>
                <span
                  className={cn(
                    "grid size-[22px] shrink-0 place-items-center rounded-full border text-caption font-semibold",
                    done ? "border-foreground bg-foreground text-background" : cur ? "border-foreground bg-background text-foreground" : "border-border-strong bg-background text-ink-2",
                  )}
                >
                  {done ? <Check className="size-[11px]" strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
        <div className="grow" />
        <p className="text-caption text-muted-foreground">
          Signed in as {user.fullName} · {user.roleLabel} · {team.toLowerCase()}
        </p>
        <form action={signOut} className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="-ml-2.5">
            Sign out
          </Button>
        </form>
      </aside>

      <main className="flex min-w-0 grow flex-col justify-center px-[120px] py-10">
        <div className="flex max-w-[620px] flex-col">
          <span className="text-body text-muted-foreground">
            Step {step + 1} of {total}
          </span>

          {current.id === "welcome" && (
            <>
              <h1 className="mt-1 text-hero font-bold tracking-[-0.035em]">Welcome to Owl Fund</h1>
              <p className="mt-2.5 text-title leading-[27px] font-normal text-ink-3">
                Three short steps, then you&apos;re in.
              </p>
              <dl className="mt-7 grid grid-cols-3 gap-8 border-t pt-4">
                <Fact label="Role">{user.roleLabel}</Fact>
                <Fact label="Team">{team}</Fact>
                <Fact label="Sign-in">{user.signIn}</Fact>
              </dl>
              {!user.teamName && !user.fundWide && (
                <p className="mt-4 text-body text-ink-2">An admin will add you to a sector team. You can finish setup now.</p>
              )}
              <div className="mt-6 flex gap-2">
                <Button type="button" className="h-[38px] px-[18px]" onClick={() => setStep(1)}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {current.id === "name" && (
            <>
              <h1 className="mt-1 text-hero font-bold tracking-[-0.035em]">Your name</h1>
              <p className="mt-2.5 text-title leading-[27px] font-normal text-ink-3">Shown to your team on notes and threads.</p>
              <div className="mt-7 flex max-w-[360px] flex-col gap-1">
                <Label htmlFor="ob-name" className="text-caption font-normal text-ink-2">
                  Full name
                </Label>
                <Input
                  id="ob-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  autoFocus
                  className="h-[34px] rounded-none border-0 border-b border-border-strong bg-transparent px-0 text-body focus-visible:border-foreground"
                />
              </div>
              <div className="mt-6 flex gap-2">
                <Button type="button" variant="secondary" className="h-[38px] px-3.5" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button type="button" className="h-[38px] px-[18px]" onClick={() => setStep(2)} disabled={!nameOk}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {current.id === "tour" && (
            <>
              <h1 className="mt-1 text-hero font-bold tracking-[-0.035em]">How it works</h1>
              <div className="mt-7 border-t">
                {TOUR_CARDS.map((c) => (
                  <div key={c.id} className="border-b border-row py-3">
                    <h2 className="text-body font-bold">{c.title}</h2>
                    <p className="mt-1 text-body text-ink-2">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-2">
                <Button type="button" variant="secondary" className="h-[38px] px-3.5" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" className="h-[38px] px-[18px]" onClick={() => setStep(3)}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {current.id === "boundary" && (
            <form action={action} className="flex flex-col">
              <input type="hidden" name="fullName" value={fullName} />
              <input type="hidden" name="acknowledged" value={acknowledged ? "on" : ""} />
              <h1 className="mt-1 text-hero font-bold tracking-[-0.035em]">The learning boundary</h1>
              <p className="mt-2.5 text-title leading-[27px] font-normal text-ink-3">{LEARNING_BOUNDARY}</p>
              <div className="mt-7 grid grid-cols-2 gap-8 border-t pt-[18px]">
                <BoundaryList title="Hoot does" items={BOUNDARY_HOOT_DOES} />
                <BoundaryList title="You do" items={BOUNDARY_YOU_DO} />
              </div>
              <Label htmlFor="ob-ack" className="mt-7 items-center gap-2.5 text-emph leading-snug font-medium">
                <Checkbox id="ob-ack" checked={acknowledged} onCheckedChange={(c) => setAcknowledged(c === true)} />
                <span>I understand that Hoot gathers evidence and I write the analysis.</span>
              </Label>
              <div className="mt-6 flex gap-2">
                <Button type="button" variant="secondary" className="h-[38px] px-3.5" onClick={() => setStep(2)} disabled={pending}>
                  Back
                </Button>
                <Button type="submit" className="h-[38px] px-[18px]" disabled={!acknowledged || pending}>
                  {pending ? "Saving…" : "Finish"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function BoundaryList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h2 className="mb-2 text-body font-bold">{title}</h2>
      <ul>
        {items.map((line) => (
          <li key={line} className="border-b border-row py-2 text-body">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="truncate text-body font-medium">{children}</dd>
    </div>
  );
}

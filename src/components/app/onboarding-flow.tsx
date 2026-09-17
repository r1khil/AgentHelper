"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Briefcase, CalendarDays, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/lib/actions/onboarding";
import type { ActionResult } from "@/lib/actions/holdings";
import { BOUNDARY_IMPLICATIONS, LEARNING_BOUNDARY, ONBOARDING_STEPS, TOUR_CARDS } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type OnboardingUser = { fullName: string; roleLabel: string; teamName: string | null; signIn: string };

const TOUR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  holdings: Briefcase,
  movements: Activity,
  earnings: CalendarDays,
  agent: Sparkles,
};

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

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-xs" aria-label="Setup steps">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                i < step ? "bg-primary/15 text-primary" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
            {i < ONBOARDING_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {current.id === "profile" && (
        <section className="space-y-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Welcome to Owl Fund</h1>
            <p className="mt-1 text-sm text-muted-foreground">A quick setup before you reach the workspace. It takes about a minute.</p>
          </div>
          <Card>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Fact label="Role">{user.roleLabel}</Fact>
              <Fact label="Team">{user.teamName ?? "No team yet"}</Fact>
              <Fact label="Sign-in">{user.signIn}</Fact>
            </CardContent>
            {!user.teamName && (
              <CardContent className="text-xs text-muted-foreground">A Fund admin assigns you to a sector team. Until then you can finish setup and wait on Today.</CardContent>
            )}
          </Card>
          <div className="grid gap-1.5">
            <Label htmlFor="ob-name">Your name</Label>
            <Input id="ob-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={120} autoFocus />
            <p className="text-xs text-muted-foreground">How you appear to your team on holdings, movements, and notes.</p>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(1)} disabled={!nameOk}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {current.id === "tour" && (
        <section className="space-y-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">How the workspace works</h1>
            <p className="mt-1 text-sm text-muted-foreground">Four things you will use most. The app gathers; you decide.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOUR_CARDS.map((c) => {
              const Icon = TOUR_ICONS[c.id] ?? Briefcase;
              return (
                <Card key={c.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      {c.title}
                    </CardTitle>
                    <CardDescription>{c.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {current.id === "boundary" && (
        <form action={action} className="space-y-5">
          <input type="hidden" name="fullName" value={fullName} />
          <input type="hidden" name="acknowledged" value={acknowledged ? "on" : ""} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">The learning boundary</h1>
            <p className="mt-1 text-sm text-muted-foreground">One rule shapes every feature. Read it once; it will not be repeated.</p>
          </div>
          <blockquote className="rounded-lg border-l-4 border-primary bg-background px-4 py-3 text-sm leading-relaxed ring-1 ring-foreground/10">
            {LEARNING_BOUNDARY}
          </blockquote>
          <div>
            <div className="mb-2 text-sm font-semibold">What this means for you</div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {BOUNDARY_IMPLICATIONS.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <Label htmlFor="ob-ack" className="flex items-start gap-3 rounded-lg border bg-background p-3 text-sm font-normal leading-snug">
            <Checkbox id="ob-ack" checked={acknowledged} onCheckedChange={(c) => setAcknowledged(c === true)} className="mt-0.5" />
            <span>I understand: the agent prepares the evidence, and I write the interpretation.</span>
          </Label>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={pending}>
              Back
            </Button>
            <Button type="submit" disabled={!acknowledged || pending}>
              {pending ? "Saving…" : "Enter the workspace"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="truncate text-sm font-medium">{children}</div>
    </div>
  );
}

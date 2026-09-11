import { developmentAuth } from "@/lib/auth";
import { localLogin } from "../actions";
import { IDS } from "@/lib/seed";
import { SubmitButton } from "@/components/app/submit-button";
import { AlertIcon } from "@/components/app/icons";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-sidebar text-sidebar-foreground flex flex-col justify-center px-8 py-14 lg:px-14">
        <div className="text-sidebar-muted mb-6 text-[10px] font-semibold tracking-[0.18em] uppercase">
          Owlfund / AgentHelper
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-tight">
          Evidence first.
          <br />
          <em className="text-sidebar-accent">Your judgment.</em>
        </h1>
        <p className="text-sidebar-muted mt-5 mb-0 max-w-sm text-sm leading-relaxed">
          A shared research workspace that brings the sources together — and
          leaves the conclusions to you.
        </p>
        <ol className="text-sidebar-muted mt-10 grid gap-2 pl-0 text-xs">
          {[
            "Gather evidence",
            "Question the explanation",
            "Own the argument",
          ].map((step, n) => (
            <li key={step} className="flex items-center gap-3">
              <span className="text-sidebar-accent font-mono">
                0{n + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-background flex flex-col justify-center px-8 py-14 lg:px-14">
        <div className="w-full max-w-sm">
          <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase">
            Welcome back
          </div>
          <h2 className="mb-1 font-serif text-2xl">Open your workspace</h2>
          <p className="text-muted-foreground mt-0 mb-5 text-[13px]">
            Invite-only access for Fund analysts.
          </p>

          {error && (
            <Alert
              variant="destructive"
              className="mb-4 flex items-center gap-2.5"
            >
              <AlertIcon className="size-4" />
              <span>{error}</span>
            </Alert>
          )}

          {developmentAuth() ? (
            <>
              <Alert variant="muted" className="mb-4">
                Local demonstration · synthetic identities
              </Alert>
              <form action={localLogin} className="grid gap-3">
                <Field>
                  Demo identity
                  <Select name="user">
                    <option value={IDS.admin}>Fund administrator</option>
                    <option value={IDS.analyst}>Healthcare analyst</option>
                    <option value={IDS.outsider}>Technology analyst</option>
                  </Select>
                </Field>
                <SubmitButton
                  className={buttonVariants({ className: "w-full" })}
                  pendingLabel="Opening…"
                >
                  Enter workspace
                </SubmitButton>
              </form>
            </>
          ) : (
            <a href="/auth/login" className={buttonVariants({ className: "w-full" })}>
              Continue with Microsoft
            </a>
          )}

          <p className="text-muted-foreground mt-5 mb-0 text-[11px] leading-relaxed">
            Development pilot. Market observations and evidence are synthetic;
            emails are captured, never sent.
          </p>
        </div>
      </section>
    </div>
  );
}

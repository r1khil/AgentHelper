import { requireActor } from "@/lib/auth";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/app/action-form";
import { AlertIcon } from "@/components/app/icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default async function Join({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const a = await requireActor();
  const error = (await searchParams).error;

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Team access"
        title="Join your research team"
        description="An authenticated account needs a team invitation before it can access research."
      />

      {error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">Your last action failed</strong> —{" "}
            {error}
          </span>
        </Alert>
      )}

      <Card className="max-w-lg p-5">
        <ActionForm
          op="join"
          returnTo="/"
          label="Accept invitation"
          pendingLabel="Joining…"
          buttonClassName={buttonVariants({ className: "justify-self-start" })}
          className="grid gap-3"
        >
          <Field>
            One-time invitation code
            <Input
              name="token"
              required
              autoComplete="off"
              minLength={40}
              maxLength={100}
              className="font-mono text-xs"
            />
          </Field>
        </ActionForm>
        <p className="text-muted-foreground mt-3 mb-0 text-xs">
          Codes are single-use and expire after seven days.
        </p>
      </Card>
    </AppShell>
  );
}

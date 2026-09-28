import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { signInWithGoogle, signInWithPassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginHoot } from "./login-hoot";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in, in the app's own look: a rail-colored pane with the mark and Hoot (dark in both themes, like the rail),
 * and the form in a panel on the warm ground. Below md the pane becomes a band above the form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col md:flex-row">
      <div
        data-rail-surface
        className="flex shrink-0 flex-col bg-rail px-6 py-5 text-rail-foreground md:w-[42%] md:max-w-[560px] md:min-w-[340px] md:px-8 md:py-7"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-body font-bold tracking-[-0.04em] text-rail">
            ON
          </span>
          <div className="min-w-0">
            <div className="text-emph font-semibold text-cream">The Owl&apos;s Nest</div>
            <div className="text-caption text-rail-foreground">Research workspace</div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-2 md:py-10">
          <LoginHoot />
        </div>
        {/* Balances the mark so Hoot sits in the middle of the pane. */}
        <div aria-hidden className="hidden h-10 md:block" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-10">
        <div className="w-full max-w-[380px]">
          <h1 className="text-display font-semibold tracking-tight">Sign in</h1>

          <div className="panel mt-5 p-6">
            {error && (
              <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-body text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{error}</span>
              </div>
            )}

            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next ?? "/"} />
              <Button type="submit" variant="outline" className="h-10 w-full gap-2">
                <GoogleIcon />
                Continue with Google
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-caption text-muted-foreground">
              <div className="h-px flex-1 bg-row" />
              or use a username
              <div className="h-px flex-1 bg-row" />
            </div>

            <form action={signInWithPassword} className="grid gap-4">
              <input type="hidden" name="next" value={next ?? "/"} />
              <div className="grid gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required className="h-10 px-3" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10 px-3" />
              </div>
              <Button type="submit" className="mt-1 h-10 w-full">
                Sign in
              </Button>
            </form>
          </div>

          <p className="mt-4 text-caption text-muted-foreground">Access is by invitation. Ask a Fund admin if you need an account.</p>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

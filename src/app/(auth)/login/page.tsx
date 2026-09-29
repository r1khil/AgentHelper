import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { signInWithGoogle, signInWithPassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OwlMark } from "@/components/app/owl-mark";

export const metadata: Metadata = { title: "Sign in" };

/** The fields are a single hairline, not boxes. */
const UNDERLINE = "h-[34px] rounded-none border-0 border-b border-border-strong bg-transparent px-0 text-body focus-visible:border-foreground";

/** Sign-in: Hoot's face, one ink button for Google, and the test-account form under a hairline. Nothing else on the page. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-10">
      <div className="flex w-[340px] max-w-full flex-col">
        <OwlMark className="size-12 rounded-full" />
        <h1 className="mt-[18px] text-display font-bold tracking-[-0.02em]">Sign in to Owl Fund</h1>
        <p className="mt-1 text-body text-muted-foreground">The fund&apos;s research and portfolio workspace</p>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-2 text-body font-medium text-caution-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <form action={signInWithGoogle} className="mt-[26px]">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Button type="submit" className="h-10 w-full rounded-lg">
            Continue with Google
          </Button>
        </form>

        <div className="mt-[22px] mb-2 flex items-center gap-2.5 text-caption text-muted-foreground">
          <span aria-hidden className="h-px grow bg-border" />
          Test accounts
          <span aria-hidden className="h-px grow bg-border" />
        </div>

        <form action={signInWithPassword} className="flex flex-col">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="username" className="text-caption font-normal text-ink-2">
              Username
            </Label>
            <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required className={UNDERLINE} />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <Label htmlFor="password" className="text-caption font-normal text-ink-2">
              Password
            </Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className={UNDERLINE} />
          </div>
          <Button type="submit" variant="secondary" className="mt-4 h-9 w-full rounded-lg">
            Sign in
          </Button>
        </form>

        <p className="mt-[22px] text-caption text-muted-foreground">Access is by invitation. Ask a fund admin if you need an account.</p>
      </div>
    </main>
  );
}

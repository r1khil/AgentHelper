import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Where an uninvited Google account lands. The account was already dropped, so the page can't name it. */
export default function NotInvited() {
  return (
    <main className="grid min-h-dvh place-items-center bg-band px-6 py-10">
      <div className="flex w-[360px] max-w-full flex-col">
        <span className="text-caption font-semibold text-caution-foreground">Not on the roster</span>
        <h1 className="mt-1.5 text-display font-bold tracking-[-0.02em]">This Google account isn&apos;t invited</h1>
        <p className="mt-2 text-body text-ink-3">
          Sign in with the Google account a fund admin invited, or ask an admin to invite this one.
        </p>
        <Button nativeButton={false} render={<Link href="/login" />} className="mt-5 h-[34px] self-start rounded-lg px-3.5">
          Back to sign in
        </Button>
      </div>
    </main>
  );
}

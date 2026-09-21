import { requireUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { OwlMark } from "@/components/app/owl-mark";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <main className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-4 py-2.5 md:px-8">
        <div className="flex items-center gap-2.5">
          <OwlMark className="size-7" />
          <span className="text-sm font-semibold">The Owl&apos;s Nest</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">{user.username ?? user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 md:px-8 md:py-12">{children}</div>
    </main>
  );
}

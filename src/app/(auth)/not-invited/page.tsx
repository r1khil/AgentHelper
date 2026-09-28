import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotInvited() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-title font-semibold">This account is not on the Fund roster</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Sign in with the Google account a Fund admin invited, or ask an admin to add your email.
        </p>
        <Button nativeButton={false} render={<Link href="/login" />} variant="outline" className="mt-6">
          Back to sign in
        </Button>
      </div>
    </main>
  );
}

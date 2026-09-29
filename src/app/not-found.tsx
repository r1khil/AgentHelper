import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OwlMark } from "@/components/app/owl-mark";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-start">
        <OwlMark className="size-10 rounded-full" />
        <h1 className="mt-4 text-display font-bold tracking-[-0.02em]">Not found</h1>
        <p className="mt-1 text-body text-ink-2">That page does not exist or you do not have access.</p>
        <Button nativeButton={false} render={<Link href="/" />} className="mt-5">
          Go home
        </Button>
      </div>
    </main>
  );
}

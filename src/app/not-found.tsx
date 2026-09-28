import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <div className="text-body font-medium">Not found</div>
        <p className="mt-1 text-body text-muted-foreground">That page does not exist or you do not have access.</p>
        <Link href="/" className="mt-4 inline-block text-body underline underline-offset-4">
          Go home
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

/**
 * Uses no auth helper at all. `requireActor()` calls redirect(), and a
 * redirect thrown inside a not-found boundary risks a loop and would bounce
 * an unauthenticated visitor to /login instead of showing a 404. Access
 * failures in this app deliberately surface as 404 rather than 403, so this
 * page must stay neutral about who is looking at it.
 */
export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-screen max-w-md place-items-center px-6">
      <div className="text-center">
        <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
          Not found
        </div>
        <h1 className="mb-2 font-serif text-2xl">
          This page is not available.
        </h1>
        <p className="text-muted-foreground mb-5 text-[13px]">
          It may not exist, or it may belong to a team you are not a member of.
        </p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-semibold transition-colors"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}

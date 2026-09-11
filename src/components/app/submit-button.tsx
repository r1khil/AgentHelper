"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/components/utils";

/**
 * The entire client-side surface of the application.
 *
 * Every mutation in this app is a native form POST to a server action that
 * ends in redirect(). Without this, buttons never disable, a double click
 * submits twice, and a slow action looks like a dead click.
 *
 * Rules, deliberately:
 *  - Never give this button a `name`/`value`. A disabled button contributes
 *    nothing to FormData, so a submitter-carried field would vanish exactly
 *    when the form is submitted.
 *  - While pending, the real label stays in the layout but invisible and the
 *    pending label is overlaid, so the button never changes size.
 *  - `pending` tracks the action promise only. `mutate` ends in redirect(),
 *    and the navigation that follows is a separate phase -- expect a short
 *    gap after pending clears.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel = "Working…",
  ...props
}: React.ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      data-pending={pending ? "" : undefined}
      className={cn("relative disabled:cursor-wait", className)}
      {...props}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2",
          pending && "invisible",
        )}
      >
        {children}
      </span>
      {pending && (
        <span className="absolute inset-0 grid place-items-center opacity-70">
          {pendingLabel}
        </span>
      )}
    </button>
  );
}

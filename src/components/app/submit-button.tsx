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
 *  - The label keeps its width while pending, so nothing reflows.
 *  - `pending` tracks the action promise only. `mutate` ends in redirect(),
 *    and the navigation that follows is a separate phase -- expect a short
 *    gap after pending clears. Loading boundaries cover that half.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel,
  ...props
}: React.ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      data-pending={pending ? "" : undefined}
      className={cn(
        "disabled:cursor-wait disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <span className="grid [grid-template-areas:'label']">
        <span
          aria-hidden={pending}
          className="col-start-1 row-start-1 [grid-area:label]"
          style={pending ? { visibility: "hidden" } : undefined}
        >
          {children}
        </span>
        {pending && (
          <span className="col-start-1 row-start-1 [grid-area:label]">
            {pendingLabel ?? "Working…"}
          </span>
        )}
      </span>
    </button>
  );
}

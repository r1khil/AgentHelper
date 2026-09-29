// Class strings shared by server and client chat components (a "use client" module can't export plain values to
// server components).

/** A quiet text action for a conversation's header row (Trace, New chat, Delete). */
export const headerAction = "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5";

/** The soft two-layer shadow under a question box, as drawn. */
export const COMPOSER_SHADOW = "shadow-[0_2px_4px_rgb(10_10_10/0.03),0_10px_28px_rgb(10_10_10/0.06)]";

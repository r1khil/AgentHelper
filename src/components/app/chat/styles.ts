// Class strings shared by server and client chat components (a "use client" module can't export plain values to
// server components).

/** A quiet text action for a conversation's header row (Trace, New chat, Delete). */
export const headerAction = "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5";

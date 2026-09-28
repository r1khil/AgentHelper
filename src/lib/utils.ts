import { createCn } from "cn/config";

/** The type scale's size names (text-caption … text-hero), defined in src/app/globals.css. */
export const TYPE_SCALE = ["caption", "body", "emph", "title", "display", "hero"] as const;

/**
 * Class joining + Tailwind conflict resolution. It has to know the scale's names: the stock `cn` reads an unknown
 * `text-body` as a text color and drops it when a real color like `text-muted-foreground` comes after it.
 */
export const cn = createCn({ extend: { theme: { text: [...TYPE_SCALE] } } });

import { cn } from "@/lib/utils";

/** The app mark: Hoot's face, rendered from the same Blender model as the companion. */
export function OwlMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/hoot/mark.webp" alt="" width={96} height={96} draggable={false} className={cn("shrink-0 object-contain", className)} aria-hidden />
  );
}

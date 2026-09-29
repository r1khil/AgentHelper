"use client";

import { usePathname } from "next/navigation";
import { PortfolioSkeleton } from "@/components/app/portfolio/view-skeletons";
import { portfolioViewFor } from "@/lib/nav";

/**
 * The Portfolio on the first visit or a change of scope (its layout and the view in the URL), and any page under a
 * team without its own loading file: shown at once on navigation, shaped like the page so nothing moves.
 */
export default function Loading() {
  return <PortfolioSkeleton view={portfolioViewFor(usePathname()) ?? "positions"} />;
}

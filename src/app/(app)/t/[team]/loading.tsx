"use client";

import { useParams } from "next/navigation";
import { OverviewSkeleton, TeamSkeleton } from "@/components/app/page-skeletons";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/** The fund's Overview or a team's page (any team page without its own loading file too): shown at once on navigation, shaped like the page so nothing moves. */
export default function Loading() {
  const { team } = useParams<{ team: string }>();
  return team === FUND_SCOPE_SLUG ? <OverviewSkeleton /> : <TeamSkeleton />;
}

import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PtSheetView } from "@/components/app/admin/pt-sheet-view";

export const metadata: Metadata = { title: "PT sheet read test" };

export default async function PtSheetTestPage({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  // Same audience the Hoot tool will have: execs and admins.
  await requireRole("exec", "admin");
  const { fresh } = await searchParams;
  return <PtSheetView fresh={fresh === "1"} />;
}

import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PtSheetView } from "@/components/app/admin/pt-sheet-view";
import { loadAdminStatus } from "../status";

export const metadata: Metadata = { title: "PT sheet read test" };

export default async function PtSheetTestPage({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  // Same audience the Hoot tool will have: execs and admins.
  await requireRole("exec", "admin");
  const { fresh } = await searchParams;
  const { attention } = await loadAdminStatus();
  return <PtSheetView fresh={fresh === "1"} attention={attention} />;
}

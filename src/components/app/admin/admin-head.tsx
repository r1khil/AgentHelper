import { PageHead } from "@/components/app/page-head";
import type { TabItem } from "@/components/app/tabs";

export type AdminTab = "members" | "jobs" | "pt-sheet";

/**
 * Admin's header on all three tabs: Manage / Admin, then Members, Jobs and connections (with how many need attention,
 * worded amber) and the PT sheet read. The tabs are links: Members is /admin, Jobs and connections /admin?tab=jobs.
 */
export function AdminHead({ active, attention, asof, actions }: { active: AdminTab; attention: number; asof?: React.ReactNode; actions?: React.ReactNode }) {
  const tabs: TabItem[] = [
    { key: "members", label: "Members", href: "/admin", active: active === "members" },
    {
      key: "jobs",
      label: "Jobs and connections",
      href: "/admin?tab=jobs",
      active: active === "jobs",
      count: attention > 0 ? <span className="text-caution-foreground">{attention}</span> : undefined,
      title: attention > 0 ? `${attention} ${attention === 1 ? "job or service needs" : "jobs or services need"} attention` : undefined,
    },
    { key: "pt-sheet", label: "PT sheet", href: "/admin/pt-sheet", active: active === "pt-sheet" },
  ];
  return <PageHead crumbs={[{ label: "Manage" }, { label: "Admin" }]} tabs={tabs} asof={asof} actions={actions} />;
}

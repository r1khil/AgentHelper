import { PageHead } from "@/components/app/page-head";
import type { TabItem } from "@/components/app/tabs";

export type AdminTab = "members" | "usage" | "jobs" | "pt-sheet";

/**
 * Admin's header on every tab: Manage / Admin, then Members, Usage, Jobs and connections (with how many need attention,
 * worded amber) and the PT sheet read. The tabs are links: Members is /admin, Usage /admin?tab=usage, Jobs and connections /admin?tab=jobs.
 */
export function AdminHead({ active, attention, asof, actions }: { active: AdminTab; attention: number; asof?: React.ReactNode; actions?: React.ReactNode }) {
  const tabs: TabItem[] = [
    { key: "members", label: "Members", href: "/admin", active: active === "members" },
    { key: "usage", label: "Usage", href: "/admin?tab=usage", active: active === "usage" },
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

import type { UsageReport } from "@/lib/usage/report";
import { fixed, fmtDateTime } from "@/lib/format";
import { PageHero } from "@/components/app/page-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTION_NAMES: Record<string, string> = {
  palette_open: "Palette opened",
  palette_select: "Palette row chosen",
  hoot_ask: "Question to Hoot",
  sidebar_toggle: "Sidebar",
  click: "Click",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = "text-right tabular-nums";

/** Admin › Usage: who uses the app, which pages and how fast they load, which actions, and what broke in browsers. */
export function UsagePanel({ report }: { report: UsageReport | null }) {
  if (!report) {
    return <p className="mt-6 text-body text-muted-foreground">Usage isn&rsquo;t available yet: apply drizzle/0027_usage_events.sql, then give members a day of use.</p>;
  }
  const { active, days } = report;
  const idle = report.members.filter((m) => m.activeDays === 0);
  return (
    <>
      <PageHero
        label={`Members using the app · production, last ${days} days, never what anyone typed`}
        value={`${active.week} this week`}
        note={`${plural(active.today, "member")} today · ${active.month} in ${days} days${idle.length ? ` · ${plural(idle.length, "member")} not seen: ${idle.slice(0, 4).map((m) => m.name).join(", ")}${idle.length > 4 ? ` and ${idle.length - 4} more` : ""}` : ""}`}
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-10 xl:grid-cols-2">
        <Section title="Members" note="Days active, pages seen and questions to Hoot">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className={num}>Days</TableHead>
                <TableHead className={num}>Pages</TableHead>
                <TableHead className={num}>Hoot</TableHead>
                <TableHead>Most seen</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-semibold">{m.name}</TableCell>
                  <TableCell className={num}>{m.activeDays}</TableCell>
                  <TableCell className={num}>{m.views}</TableCell>
                  <TableCell className={num}>{m.hootAsks}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-caption">{m.topRoute ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.lastSeen ? fmtDateTime(m.lastSeen) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Pages" note="Median time in view; load time is the slowest quarter's largest paint (LCP, p75)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className={num}>Views</TableHead>
                <TableHead className={num}>Members</TableHead>
                <TableHead className={num}>In view</TableHead>
                <TableHead className={num}>Load</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.pages.length === 0 && <Empty cols={5} />}
              {report.pages.map((p) => (
                <TableRow key={p.route}>
                  <TableCell className="max-w-64 truncate font-mono text-caption">{p.route}</TableCell>
                  <TableCell className={num}>{p.views}</TableCell>
                  <TableCell className={num}>{p.members}</TableCell>
                  <TableCell className={num}>{p.medianSec === null ? "—" : duration(p.medianSec)}</TableCell>
                  <TableCell className={`${num} ${p.p75LcpMs !== null && p.p75LcpMs > 2500 ? "text-caution-foreground" : ""}`}>{p.p75LcpMs === null ? "—" : `${fixed(p.p75LcpMs / 1000, 1)}s`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Actions" note="Palette, Hoot, sidebar and marked buttons">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className={num}>Times</TableHead>
                <TableHead className={num}>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.actions.length === 0 && <Empty cols={4} />}
              {report.actions.map((a) => (
                <TableRow key={`${a.name}:${a.detail}`}>
                  <TableCell>{ACTION_NAMES[a.name] ?? a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.detail || "—"}</TableCell>
                  <TableCell className={num}>{a.count}</TableCell>
                  <TableCell className={num}>{a.members}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Browser errors" note="Uncaught errors members hit, newest first">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Error</TableHead>
                <TableHead>Page</TableHead>
                <TableHead className={num}>Times</TableHead>
                <TableHead>Last</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.errors.length === 0 && <Empty cols={4} text="None recorded" />}
              {report.errors.map((e) => (
                <TableRow key={e.message}>
                  <TableCell className="max-w-72 truncate" title={e.message}>
                    {e.message}
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono text-caption">{e.route ?? "—"}</TableCell>
                  <TableCell className={num}>{e.count}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(e.last)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
    </>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-title font-bold tracking-[-0.01em]">{title}</h2>
      <p className="mb-2 text-caption text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

function Empty({ cols, text = "Nothing yet" }: { cols: number; text?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function duration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.round(sec - m * 60)}s`;
}

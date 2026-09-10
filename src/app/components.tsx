import Link from "next/link";
import { DateTime } from "luxon";
import { signOut, mutate } from "./actions";
import type { Actor } from "@/lib/access";
export function Shell({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            a<span>h</span>
          </span>
          <span>
            AgentHelper<small>OWLFUND RESEARCH</small>
          </span>
        </Link>
        <div className="side-label">WORKSPACE</div>
        <Link className="nav-link" href="/">
          ◈ <span>Overview</span>
        </Link>
        <Link className="nav-link" href="/join">
          ⊕ <span>Join a team</span>
        </Link>
        {actor.admin && (
          <Link className="nav-link" href="/admin">
            ⚙ <span>Administration</span>
          </Link>
        )}
        <div className="side-note">
          <span className="live-dot" /> DEVELOPMENT
          <br />
          <p>
            Synthetic evidence.
            <br />
            Real analytical practice.
          </p>
        </div>
        <div className="profile">
          <div className="avatar">{actor.name[0]}</div>
          <div>
            <strong>{actor.name}</strong>
            <small>{actor.admin ? "Fund administrator" : "Team analyst"}</small>
          </div>
        </div>
        <form action={signOut}>
          <button className="signout">Sign out ↗</button>
        </form>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>RESEARCH / EVIDENCE WORKSPACE</span>
          <span className="pill">● &nbsp; Synthetic pilot</span>
        </header>
        <main>{children}</main>
        <footer>
          The agent prepares the evidence. The analyst owns the interpretation.
        </footer>
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>{status.replaceAll("_", " ")}</span>
  );
}
export function Time({ value }: { value: Date | string | null }) {
  return (
    <>
      {value
        ? DateTime.fromJSDate(new Date(value))
            .setZone("America/New_York")
            .toFormat("MMM d, h:mm a ZZZZ")
        : "Not configured"}
    </>
  );
}
export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <div className="notice error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Action({
  op,
  id,
  returnTo,
  label,
  children,
}: {
  op: string;
  id?: string;
  returnTo: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={mutate}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <button>{label}</button>
    </form>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function MoneyMove({ value }: { value: string | number }) {
  const n = Number(value);
  return (
    <span className={n >= 0 ? "positive" : "negative"}>
      {n > 0 ? "+" : ""}
      {n.toFixed(2)}
    </span>
  );
}

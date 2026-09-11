import { DateTime } from "luxon";
/**
 * Barrel re-export. Implementation moved to src/components/app so pages can
 * migrate one at a time. This file is deleted once they all import directly.
 */
export { AppShell as Shell } from "@/components/app/shell";

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
/**
 * Barrel re-export. The implementation moved to src/components/app so pages
 * can migrate one at a time without touching their imports. This file is
 * deleted once every page imports from @/components/app directly.
 */
export { ActionForm as Action } from "@/components/app/action-form";

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

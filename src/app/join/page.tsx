import { requireActor } from "@/lib/auth";
import { Shell, PageTitle, Action, ErrorNotice } from "../components";
export default async function Join({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const a = await requireActor();
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow="TEAM ACCESS"
        title="Join your research team."
        description="An authenticated account needs a team invitation before it can access research."
      />
      <ErrorNotice message={(await searchParams).error} />
      <div className="panel form-panel">
        <Action op="join" returnTo="/" label="Accept invitation">
          <label>
            One-time invitation code
            <input
              name="token"
              required
              autoComplete="off"
              minLength={40}
              maxLength={100}
            />
          </label>
        </Action>
      </div>
    </Shell>
  );
}

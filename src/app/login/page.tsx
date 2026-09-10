import { developmentAuth } from "@/lib/auth";
import { localLogin } from "../actions";
import { IDS } from "@/lib/seed";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <section className="login-story">
        <div className="eyebrow">OWLFUND / AGENTHELPER</div>
        <h1>
          Evidence first.
          <br />
          <em>Your judgment.</em>
        </h1>
        <p>
          A shared research workspace that brings the sources together—and
          leaves the conclusions to you.
        </p>
        <div className="login-rule">
          01 &nbsp; Gather evidence
          <br />
          02 &nbsp; Question the explanation
          <br />
          03 &nbsp; Own the argument
        </div>
      </section>
      <section className="login-panel">
        <div className="eyebrow">WELCOME BACK</div>
        <h2>Open your workspace</h2>
        <p>Invite-only access for Fund analysts.</p>
        {error && <div className="notice error">{error}</div>}
        {developmentAuth() ? (
          <>
            <div className="notice">
              Local demonstration · synthetic identities
            </div>
            <form action={localLogin}>
              <label>
                Demo identity
                <select name="user">
                  <option value={IDS.admin}>Fund administrator</option>
                  <option value={IDS.analyst}>Healthcare analyst</option>
                  <option value={IDS.outsider}>Technology analyst</option>
                </select>
              </label>
              <button>Enter workspace →</button>
            </form>
          </>
        ) : (
          <a className="button" href="/auth/login">
            Continue with Microsoft →
          </a>
        )}
        <small>
          Development pilot. Market observations and evidence are synthetic;
          emails are captured, never sent.
        </small>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { rebuildPrepPack } from "@/lib/actions/earnings";
import { Button } from "@/components/ui/button";

/**
 * "Build now" for the prep pack. Building it is one model run, and the first time a pack is built for a report the team's
 * leads are emailed, so it asks first and names them; "Build without emailing" is the plain way to run it. Nothing is
 * emailed unless the last button is pressed.
 */
export function PrepPackBuild({ id, rebuild, recipients }: { id: string; rebuild: boolean; recipients: { name: string; email: string }[] }) {
  const [asking, setAsking] = useState(false);
  const who = recipients.length ? recipients.map((r) => r.name).join(", ") : "nobody: no lead or member is set up for this team";
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" size="sm" variant="secondary" aria-expanded={asking} aria-controls="prep-build-ask" onClick={() => setAsking((a) => !a)} title="Have Hoot gather the evidence (one model run)">
        {rebuild ? "Rebuild" : "Build now"}
      </Button>
      {asking && (
        <form id="prep-build-ask" action={rebuildPrepPack} role="alertdialog" aria-label="Confirm building the prep pack" className="flex flex-col gap-2 text-body">
          <input type="hidden" name="id" value={id} />
          <span className="leading-5">
            <b className="font-semibold">Building this can email {who}</b> <span className="text-ink-2">via OpenMail, the first time a pack is built for this report. It takes a minute.</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="secondary" name="send" value="none" autoFocus>
              Build without emailing
            </Button>
            {recipients.length > 0 && (
              <Button type="submit" size="sm" name="send" value="list">
                Build and email {recipients.length === 1 ? "1 person" : `${recipients.length} people`}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

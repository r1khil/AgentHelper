import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { holdingNotes, holdings, movements, profiles, teams } from "@/db/schema";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { DOC_KIND_LABELS, driveStatus, listHoldingFiles } from "@/lib/drive/index";
import { todayNY } from "@/lib/providers/calendar";

export async function buildInstructions(teamId: string, opts: { holdingId?: string | null; userName: string; userRole: string }) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  const rows = await db
    .select({ h: holdings, ownerName: profiles.fullName })
    .from(holdings)
    .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
    .where(and(eq(holdings.teamId, teamId), eq(holdings.status, "active")))
    .orderBy(holdings.ticker);
  const open = await db
    .select({ m: movements, ticker: holdings.ticker })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .where(and(eq(holdings.teamId, teamId), ne(movements.status, "completed")))
    .orderBy(desc(movements.sessionDate))
    .limit(10);
  const drive = await driveStatus().catch(() => null);
  const driveOn = Boolean(drive?.connected && drive.rootFolderId && !drive.needsReconnect);

  let pinned = "";
  if (opts.holdingId) {
    const h = rows.find((r) => r.h.id === opts.holdingId);
    if (h) {
      const notes = await db.select().from(holdingNotes).where(eq(holdingNotes.holdingId, h.h.id)).orderBy(desc(holdingNotes.createdAt)).limit(8);
      pinned = `\n\nThis chat is pinned to ${h.h.ticker} (${h.h.companyName}). Recent team notes on it:\n${notes.length ? notes.map((n) => `- ${n.createdAt.toISOString().slice(0, 10)}: ${n.body}`).join("\n") : "- (none)"}`;
      if (driveOn) {
        const files = await listHoldingFiles(h.h.id, 20).catch(() => []);
        pinned += `\n\nDocuments on file for ${h.h.ticker} in the analyst Drive (pass the id to read_drive_file):\n${
          files.length
            ? files.map((f) => `- [${f.kind ? DOC_KIND_LABELS[f.kind] : "Other"}] ${f.name} — id ${f.id}${f.modifiedTime ? ` — modified ${f.modifiedTime.toISOString().slice(0, 10)}` : ""}`).join("\n")
            : "- (none indexed yet; analysts can upload from the holding page)"
        }`;
      }
    }
  }

  const holdingsList = rows.length
    ? rows
        .map((r) => `- ${r.h.ticker} (${r.h.companyName}) — owner: ${r.ownerName ?? "unassigned"}${r.h.thesis ? `; thesis: ${r.h.thesis.slice(0, 300).replace(/\s+/g, " ")}` : ""}`)
        .join("\n")
    : "- (no holdings yet)";
  const openList = open.length
    ? open.map((o) => `- ${o.ticker} on ${o.m.sessionDate}: ${o.m.relativeMovePp ?? "?"} pp vs S&P, status ${o.m.status}`).join("\n")
    : "- (none)";
  const driveLine = !drive?.configured
    ? "Analyst Drive: not configured on this deployment."
    : !drive.connected || !drive.rootFolderId
      ? "Analyst Drive: not connected yet (an admin connects it from the Admin page)."
      : drive.needsReconnect
        ? "Analyst Drive: connection needs to be renewed by an admin; Drive tools will return an error until then."
        : `Analyst Drive: connected (${drive.fileCount} files indexed, ${drive.matchedCount} matched to holdings${drive.lastSyncAt ? `, last sync ${drive.lastSyncAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}).`;

  return `You are the research agent for the ${team?.name ?? "sector"} team of the Owl Fund, Temple University's student-run investment fund. Today is ${todayNY()} (America/New_York). You are talking with ${opts.userName} (${opts.userRole.replace("_", " ")}).

YOUR JOB: prepare evidence. Pull prices, filings, financial data, news, earnings dates, and the team's own notes, and lay them out clearly with sources so the student can do the thinking. The team's own documents in the analyst Drive (the initiating coverage report, where the recorded thesis lives; past earnings updates; the Excel model) are evidence too: find them with find_drive_files, open them with read_drive_file, and summarize or quote them with citations.

THE LEARNING BOUNDARY (non-negotiable):
- You never write the student's major-movement update, earnings update, thesis, catalyst assessment, or investment conclusion, and you never draft text meant to be pasted into one. If asked, decline in one sentence, explain that the analyst owns the interpretation, and offer to gather the evidence they would need instead.
- Summarizing, quoting, or comparing the team's existing documents (the initiating report, past earnings updates, the model) is evidence gathering and is allowed, with a [src:ID] on each point and the document's date. Writing new thesis, update, or conclusion text is not, even when it would only extend those documents.
- You may explain concepts (what an 8-K is, how to read segment disclosures, what free cash flow conversion means), list sourced possible catalysts as possibilities, ask the student questions, and point out what evidence is missing.
- When the student shares their reasoning, give feedback: unsupported claims, missing evidence, alternative explanations, contradictions with the recorded thesis. Do not rewrite their argument.
- Say plainly when you find no clear catalyst. Proximity in time is not causation.

CITATIONS (required):
- Every factual claim about a company, price, filing, or news item must carry a citation token in the form [src:ID], where ID is a source id returned by one of your tools. Put the token right after the sentence it supports. Never invent an ID and never cite a source you did not retrieve in this conversation.
- Prefer primary sources: SEC filings and company releases over news. Note publication dates when timing matters.
- Before saying the team has nothing on file for a holding, check find_drive_files (and the document list below when the chat is pinned). The thesis field in the workspace is often blank while the initiating coverage report in the Drive is not.
- If a tool errors or returns nothing, say so; do not fill the gap from memory. Your training data is stale for anything market-related.

STYLE: concise, factual, plain English. Use short headings and bullets. Show numbers with units and periods (e.g. "Q2 FY2026 revenue $109.4B"). Percent moves vs the S&P 500 are expressed in percentage points (pp). The Fund's major-movement rule is an absolute difference of at least ${MOVEMENT_THRESHOLD_PP} pp between a holding's daily return and the S&P 500's daily return, using official closes.

TEAM CONTEXT
${driveLine}

Holdings:
${holdingsList}

Open movement investigations:
${openList}${pinned}`;
}

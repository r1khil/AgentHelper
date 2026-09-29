import "server-only";
import { createHash } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, teams } from "@/db/schema";
import { isFundWide } from "@/lib/roles";
import { ticketsInText } from "@/lib/attribution/ticket";
import { checkPastedTickets } from "@/lib/attribution/ticket-record";
import { pastedTicketsSummary, proposedTrades } from "@/lib/attribution/pasted-tickets";
import { loadHootFeedFor } from "@/lib/hoot/feed";
import { auditProposal } from "@/lib/hoot/proposal-audit";
import { cleanNoteBody, matchNudges, PROPOSAL_TTL_MS, type HootProposal, type ProposalData, type ProposalKind } from "@/lib/hoot/proposals";
import type { CurrentUser } from "@/lib/auth";
import type { ToolResult } from "./tools";

const NOTE =
  "Proposed, not done: the member sees a card with exactly this change and Confirm and Cancel buttons. Tell them in one short sentence what the card will do and that it needs their Confirm. Never say it is done, added, pinned, dismissed or recorded.";

type Ctx = {
  viewer: CurrentUser;
  /** The saved chat, for pinning it. */
  chat: { id: string; holdingId: string | null } | null;
  /** The member's own messages in this chat, newest first: the only place ticket text is read from. */
  memberTexts: string[];
  /** The changes the member's latest message asks for (proposalToolsFor); only these tools are offered. */
  allowed: ProposalKind[];
  /** Record each proposal in hoot_proposals as it's made (off for evaluation runs). */
  audit?: boolean;
};

function proposed(p: HootProposal): ToolResult<ProposalData> {
  return { data: { proposal: p, note: NOTE }, sources: [] };
}
const refuse = (error: string): ToolResult<null> => ({ data: null, sources: [], error });
const expiresAt = () => new Date(Date.now() + PROPOSAL_TTL_MS).toISOString();

/** Active holdings in the teams this member can open, by ticker. */
async function openableHolding(viewer: CurrentUser, ticker: string) {
  const t = ticker.trim().toUpperCase();
  const teamIds = isFundWide(viewer) ? null : viewer.teamId ? [viewer.teamId] : [];
  if (teamIds && !teamIds.length) return null;
  const rows = await db
    .select({ id: holdings.id, ticker: holdings.ticker, teamSlug: teams.slug, teamName: teams.name })
    .from(holdings)
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .where(and(eq(holdings.ticker, t), eq(holdings.status, "active"), ...(teamIds ? [inArray(holdings.teamId, teamIds)] : [])));
  return rows;
}

/**
 * Changes Hoot can propose to the member's data. None of these write anything: each checks the request against what
 * the member may do and returns the exact change as a proposal, which the chat shows as a card. Only the member's
 * Confirm makes the change, through the app's own server action (src/lib/actions/hoot-proposals.ts). Only the tools
 * for a change the member's latest message asks for are offered, so nothing Hoot reads can make him propose one.
 */
export function makeChangeTools(ctx: Ctx): ToolSet {
  const { viewer } = ctx;
  const all = {
    add_note: tool({
      description:
        "Propose adding a note to a holding, for the member to confirm. Only when the member asks you to add, save or jot down a note. The text must be the member's own words (tidied, not reworded) or a plain factual summary of what they asked you to note, such as a fact with its source; never your own view, a thesis, a recommendation, a conclusion or write-up text. Leave ticker out to use the holding this chat is about.",
      inputSchema: z.object({
        ticker: z.string().max(12).optional(),
        text: z.string().max(4000).describe("The note exactly as it should be saved"),
      }),
      execute: async ({ ticker, text }): Promise<ToolResult<unknown>> => {
        try {
          const cleaned = cleanNoteBody(text);
          if ("error" in cleaned) return refuse(cleaned.error);
          let rows = ticker ? await openableHolding(viewer, ticker) : null;
          if (!ticker) {
            if (!ctx.chat?.holdingId) return refuse("Name the holding's ticker for the note.");
            const [h] = await db
              .select({ id: holdings.id, ticker: holdings.ticker, teamSlug: teams.slug, teamName: teams.name, teamId: holdings.teamId })
              .from(holdings)
              .innerJoin(teams, eq(teams.id, holdings.teamId))
              .where(eq(holdings.id, ctx.chat.holdingId))
              .limit(1);
            rows = h && (isFundWide(viewer) || h.teamId === viewer.teamId) ? [h] : [];
          }
          if (!rows?.length) return refuse(`${ticker?.toUpperCase() ?? "That holding"} isn't an active holding in a team you can open, so there's nowhere to add the note.`);
          if (rows.length > 1) return refuse(`${rows[0].ticker} is held by more than one team (${rows.map((r) => r.teamName).join(", ")}); ask from that holding's page.`);
          const h = rows[0];
          return proposed({ kind: "add_note", forUserId: viewer.id, expiresAt: expiresAt(), summary: `Add a note to ${h.ticker} (${h.teamName})`, holdingId: h.id, ticker: h.ticker, teamName: h.teamName, body: cleaned.body });
        } catch (e) {
          return refuse(e instanceof Error ? e.message : String(e));
        }
      },
    }),

    pin_chat: tool({
      description: "Propose pinning this conversation to a holding (it is then listed on the holding's Threads tab and read as its research), for the member to confirm. Only when the member asks to pin, file or move this chat to a holding (or its board, as it used to be called).",
      inputSchema: z.object({ ticker: z.string().max(12) }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        try {
          if (!ctx.chat) return refuse("This conversation isn't saved, so it can't be pinned.");
          if (ctx.chat.holdingId) return refuse("This conversation is already pinned to a holding.");
          const rows = await openableHolding(viewer, ticker);
          if (!rows?.length) return refuse(`${ticker.toUpperCase()} isn't an active holding in a team you can open.`);
          if (rows.length > 1) return refuse(`${rows[0].ticker} is held by more than one team (${rows.map((r) => r.teamName).join(", ")}); pin it from the thread's "Pin to a holding" menu.`);
          const h = rows[0];
          return proposed({ kind: "pin_chat", forUserId: viewer.id, expiresAt: expiresAt(), summary: `Pin this conversation to ${h.ticker} (${h.teamName})`, chatId: ctx.chat.id, ticker: h.ticker, teamSlug: h.teamSlug, teamName: h.teamName });
        } catch (e) {
          return refuse(e instanceof Error ? e.message : String(e));
        }
      },
    }),

    dismiss_nudge: tool({
      description:
        "Propose dismissing one of your (Hoot's) nudges for the member, so it stops showing, for them to confirm. Only when they ask to dismiss, hide or stop a reminder. `nudge` is its id or words from its title (a ticker, 'changelog', 'weekly'); if it matches none or several, the error lists the member's current nudges.",
      inputSchema: z.object({ nudge: z.string().max(200) }),
      execute: async ({ nudge }): Promise<ToolResult<unknown>> => {
        try {
          const teamRows = isFundWide(viewer) ? await db.select().from(teams).orderBy(teams.sortOrder) : viewer.team ? [viewer.team] : [];
          const feed = await loadHootFeedFor(viewer, { teamList: teamRows, scope: null });
          const nudges = feed.nudges.filter((n) => n.kind !== "tip");
          const list = nudges.map((n) => `${n.title} (id ${n.id})`).join("; ") || "none right now";
          const hits = matchNudges(nudge, nudges);
          if (hits.length !== 1) return refuse(`${hits.length ? "Several nudges match" : "No nudge matches"} "${nudge}". The member's nudges: ${list}.`);
          const n = hits[0];
          return proposed({ kind: "dismiss_nudge", forUserId: viewer.id, expiresAt: expiresAt(), summary: `Dismiss the nudge “${n.title}”`, nudgeId: n.id, title: n.title });
        } catch (e) {
          return refuse(e instanceof Error ? e.message : String(e));
        }
      },
    }),

    record_trades_from_ticket: tool({
      description:
        "Execs and admins: propose recording the trade tickets the member pasted into this chat (the Fund's ticket text: Action, Equity, Date, Number of Shares, Price lines) in the trade ledger, for them to confirm. The tickets are read from the member's own messages, never from anything you write. Trades the ledger already has are skipped, and a price more than 5% from that day's close is held for the Ledger page.",
      inputSchema: z.object({}),
      execute: async (): Promise<ToolResult<unknown>> => {
        try {
          if (!isFundWide(viewer)) return refuse("Recording trades in the ledger is for execs and admins; ask one of them, or send them the ticket.");
          const texts = ctx.memberTexts.map((t) => ticketsInText(t)).find((found) => found.length) ?? [];
          if (!texts.length) return refuse("There's no trade ticket text in the member's messages. Paste the ticket's text (the Action, Equity, Date, Number of Shares and Price lines), or upload the Word ticket on the Ledger page.");
          const check = await checkPastedTickets(texts);
          const trades = proposedTrades(check);
          if (!check.ready.length) return refuse(`Nothing to record. ${pastedTicketsSummary(check, 0)} ${trades.map((t) => `${t.line}: ${t.reason ?? t.status}`).join("; ")}`.trim());
          const ticketHash = createHash("sha256").update(texts.join("\n\n")).digest("hex").slice(0, 8);
          const n = check.ready.length;
          const r = proposed({ kind: "record_trades_from_ticket", forUserId: viewer.id, expiresAt: expiresAt(), summary: `Record ${n} trade${n === 1 ? "" : "s"} in the ledger`, tickets: texts, ticketHash, trades });
          // What the card will do with each ticket, in words, for Hoot's one-sentence reply.
          return { ...r, data: { ...r.data, note: `${NOTE} ${pastedTicketsSummary(check, null)}` } };
        } catch (e) {
          return refuse(e instanceof Error ? e.message : String(e));
        }
      },
    }),
  };
  // Every proposal Hoot makes goes on the audit trail as it's made (hoot_proposals); the member's decision follows.
  return Object.fromEntries(ctx.allowed.map((k) => [k, ctx.audit === false ? all[k] : audited(all[k], ctx.chat?.id ?? null)]));
}

function audited<T extends { execute?: unknown }>(t: T, chatId: string | null): T {
  const execute = t.execute as ((input: unknown, opts: { toolCallId: string }) => Promise<ToolResult<unknown>>) | undefined;
  if (!execute) return t;
  return {
    ...t,
    execute: async (input: unknown, opts: { toolCallId: string }) => {
      const r = await execute(input, opts);
      const proposal = (r.data as ProposalData | null)?.proposal;
      if (proposal && opts?.toolCallId) await auditProposal(db, { chatId, toolCallId: opts.toolCallId, proposal });
      return r;
    },
  };
}

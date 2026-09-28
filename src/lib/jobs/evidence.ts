import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { dailyCloses, earnings, evidenceItems, holdings, movements } from "@/db/schema";
import { listFilings } from "@/lib/providers/edgar";
import { finnhubConfigured, getCompanyNews } from "@/lib/providers/finnhub";
import { NY } from "@/lib/providers/calendar";
import { SPX_SYMBOL } from "@/lib/providers/yahoo";
import { fmtBp, fmtPct } from "@/lib/format";

/** Attach news, 8-Ks, peer moves, and upcoming earnings to a movement. Idempotent: clears and rewrites the movement's evidence. */
export async function gatherMovementEvidence(movementId: string) {
  const [row] = await db
    .select({ m: movements, h: holdings })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .where(eq(movements.id, movementId))
    .limit(1);
  if (!row) return { ok: false, reason: "not found" };
  const { m, h } = row;
  const session = DateTime.fromISO(m.sessionDate, { zone: NY });
  const items: (typeof evidenceItems.$inferInsert)[] = [];

  // Company news in a 3-day window ending on the session date.
  if (finnhubConfigured()) {
    try {
      const from = session.minus({ days: 3 }).toISODate()!;
      const to = session.plus({ days: 1 }).toISODate()!;
      const news = await getCompanyNews(h.ticker, from, to);
      for (const n of news.slice(0, 15)) {
        items.push({ movementId, kind: "news", title: n.headline, url: n.url, publisher: n.source, publishedAt: new Date(n.publishedAt), payload: { summary: n.summary?.slice(0, 400) ?? "" } });
      }
    } catch (e) {
      items.push({ movementId, kind: "news", title: `News lookup failed: ${e instanceof Error ? e.message : String(e)}`, payload: { error: true } });
    }
  }

  // 8-Ks and other filings in the last 7 days.
  if (h.cik) {
    try {
      const since = session.minus({ days: 7 }).toISODate()!;
      const filings = await listFilings(h.cik, { forms: ["8-K", "8-K/A", "10-Q", "10-K", "6-K"], since, limit: 10 });
      for (const f of filings) {
        items.push({ movementId, kind: "filing", title: `${f.form} filed ${f.filedAt}${f.description ? ` — ${f.description}` : ""}`, url: f.url, publisher: "SEC EDGAR", publishedAt: new Date(`${f.filedAt}T12:00:00Z`), payload: { form: f.form, accession: f.accession, reportDate: f.reportDate ?? null } });
      }
    } catch (e) {
      items.push({ movementId, kind: "filing", title: `EDGAR lookup failed: ${e instanceof Error ? e.message : String(e)}`, payload: { error: true } });
    }
  }

  // Peer moves: the team's other holdings on the same session, from stored closes.
  const peers = await db.select().from(holdings).where(and(eq(holdings.teamId, h.teamId), eq(holdings.status, "active")));
  const tickers = [...new Set([...peers.map((p) => p.ticker), SPX_SYMBOL])];
  const prevSession = await previousStoredSession(m.sessionDate, SPX_SYMBOL);
  if (prevSession) {
    const closes = await db.select().from(dailyCloses).where(and(inArray(dailyCloses.ticker, tickers), inArray(dailyCloses.sessionDate, [m.sessionDate, prevSession])));
    const by = new Map<string, { cur?: number; prev?: number }>();
    for (const c of closes) {
      const e = by.get(c.ticker) ?? {};
      if (c.sessionDate === m.sessionDate) e.cur = Number(c.close);
      else e.prev = Number(c.close);
      by.set(c.ticker, e);
    }
    const spx = by.get(SPX_SYMBOL);
    const spxRet = spx?.cur && spx.prev ? (spx.cur / spx.prev - 1) * 100 : null;
    for (const p of peers) {
      if (p.ticker === h.ticker) continue;
      const e = by.get(p.ticker);
      if (!e?.cur || !e.prev || spxRet === null) continue;
      const ret = (e.cur / e.prev - 1) * 100;
      items.push({ movementId, kind: "peer_move", title: `${p.ticker} ${fmtPct(ret)} (${fmtBp((ret - spxRet) * 100)} vs S&P)`, publisher: "Yahoo Finance", payload: { ticker: p.ticker, returnPct: +ret.toFixed(4), relativePp: +(ret - spxRet).toFixed(4) } });
    }
  }

  // Upcoming earnings, if known.
  const [nextEarnings] = await db.select().from(earnings).where(and(eq(earnings.holdingId, h.id), eq(earnings.status, "upcoming"))).limit(1);
  if (nextEarnings) {
    items.push({ movementId, kind: "financial", title: `Next earnings ${nextEarnings.reportDate} (${nextEarnings.dateStatus})`, url: nextEarnings.dateSourceUrl, publisher: "Calendar", payload: { reportDate: nextEarnings.reportDate, dateStatus: nextEarnings.dateStatus } });
  }

  await db.transaction(async (tx) => {
    await tx.delete(evidenceItems).where(eq(evidenceItems.movementId, movementId));
    if (items.length) await tx.insert(evidenceItems).values(items);
    await tx.update(movements).set({ evidenceStatus: "ready" }).where(eq(movements.id, movementId));
  });
  return { ok: true, count: items.length };
}

async function previousStoredSession(sessionDate: string, ticker: string) {
  const rows = await db.select({ d: dailyCloses.sessionDate }).from(dailyCloses).where(eq(dailyCloses.ticker, ticker));
  const before = rows.map((r) => r.d).filter((d) => d < sessionDate).sort();
  return before.at(-1) ?? null;
}

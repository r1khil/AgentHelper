// Hoot's regression set: runs every question in src/lib/agent/eval/cases.ts as a real turn (live model, live data)
// and scores it: which tools it used, failed or repeated lookups, narration, uncited facts, time and tokens, and
// each case's own expectations. Use it before and after a prompt, tool or model change.
//
// Usage: npm run eval:hoot -- [--only id,id] [--tag control] [--concurrency 2] [--compare .artifacts/hoot-eval/<run>.json] [--show-answers]
//
// Each case runs in a temporary chat that is deleted afterwards; nothing is saved to the research log (memoryOff).
// Results go to .artifacts/hoot-eval/<timestamp>.json. Cases needing a provider that isn't configured here (FRED,
// the Python sandbox, web search, the analyst Drive) are skipped and listed. Portfolio questions run as test.exec, the rest as test.analyst.
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, profiles, teams } from "@/db/schema";
import { runAgentTurn } from "@/lib/agent/run";
import { agentModelId } from "@/lib/agent/model";
import { loadMessages, saveMessages, setRunStatus } from "@/lib/chats";
import { fredConfigured } from "@/lib/providers/fred";
import { sandboxAvailable } from "@/lib/sandbox/python";
import { tavilyConfigured } from "@/lib/web/tavily";
import { driveStatus } from "@/lib/drive/index";
import { EVAL_CASES, type EvalCase } from "@/lib/agent/eval/cases";
import { compareRuns, scoreTurn, summarize, type EvalTurn } from "@/lib/agent/eval/score";
import type { CurrentUser } from "@/lib/auth";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function viewerFor(username: string): Promise<CurrentUser> {
  const [row] = await db.select({ profile: profiles, team: teams }).from(profiles).leftJoin(teams, eq(teams.id, profiles.teamId)).where(eq(profiles.username, username)).limit(1);
  if (!row) throw new Error(`No ${username} account; create it from the Admin page first.`);
  return { ...row.profile, team: row.team };
}

async function runCase(c: EvalCase, viewers: Record<EvalCase["as"], CurrentUser>, fallbackTeamId: string): Promise<EvalTurn> {
  const viewer = viewers[c.as];
  const [holding] = c.ticker ? await db.select().from(holdings).where(eq(holdings.ticker, c.ticker)).limit(1) : [];
  const teamId = holding?.teamId ?? viewer.teamId ?? fallbackTeamId;
  const [chat] = await db.insert(chats).values({ teamId, holdingId: holding?.id ?? null, title: `eval: ${c.id}`, createdBy: viewer.id }).returning();
  try {
    const user: UIMessage = { id: "msg-eval-1", role: "user", parts: [{ type: "text", text: c.question }], ...(c.page ? { metadata: { page: c.page } } : {}) };
    await saveMessages(chat.id, [user]);
    await setRunStatus(chat.id, "running");
    const { clientStream, persisted } = await runAgentTurn({ chat, user: { id: viewer.id, fullName: viewer.fullName, role: viewer.role }, viewer, messages: [user], memoryOff: true });
    // Nobody is watching; let the server-owned branch finish on its own.
    await clientStream.cancel("eval").catch(() => {});
    await persisted;
    const assistant = (await loadMessages(chat.id)).find((m) => m.role === "assistant");
    if (!assistant) throw new Error("no assistant message saved");
    return scoreTurn(c, assistant);
  } finally {
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chat.id));
    await db.delete(chats).where(eq(chats.id, chat.id));
  }
}

function crashed(c: EvalCase, e: unknown): EvalTurn {
  const detail = e instanceof Error ? e.message : String(e);
  return { id: c.id, pass: false, checks: [{ name: "ran", pass: false, detail }], calls: [], errors: 0, duplicates: 0, narration: 0, steps: null, uncited: null, repaired: false, writeUp: null, unanswered: true, ms: null, tokens: { input: null, output: null }, answer: "" };
}

async function main() {
  const only = arg("only")?.split(",");
  const tag = arg("tag");
  const concurrency = Math.max(1, Number(arg("concurrency") ?? 1));
  const drive = await driveStatus().catch(() => null);
  const available = { fred: fredConfigured(), sandbox: sandboxAvailable(), web: tavilyConfigured(), drive: Boolean(drive?.configured && drive.connected && !drive.needsReconnect) };
  const selected = EVAL_CASES.filter((c) => (!only || only.includes(c.id)) && (!tag || c.tags.includes(tag as EvalCase["tags"][number])));
  const skipped = selected.filter((c) => c.needs?.some((n) => !available[n]));
  const cases = selected.filter((c) => !skipped.includes(c));
  if (!cases.length) throw new Error("No cases selected.");

  const model = await agentModelId();
  const viewers = { exec: await viewerFor("test.exec"), associate: await viewerFor("test.analyst") };
  const [anyTeam] = await db.select({ id: teams.id }).from(teams).where(inArray(teams.slug, ["fig", "tech"])).limit(1);
  console.log(`Hoot eval · ${model} · ${cases.length} case${cases.length === 1 ? "" : "s"}${skipped.length ? ` · skipped (provider not configured here): ${skipped.map((c) => c.id).join(", ")}` : ""}\n`);

  const results: EvalTurn[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
      for (let i = next++; i < cases.length; i = next++) {
        const c = cases[i];
        const r = await runCase(c, viewers, anyTeam.id).catch((e) => crashed(c, e));
        results[i] = r;
        const failed = r.checks.filter((x) => !x.pass).map((x) => (x.detail ? `${x.name} (${x.detail})` : x.name));
        console.log(
          `${r.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(26)} ${String(r.calls.length).padStart(2)} lookups${r.errors ? `, ${r.errors} failed` : ""}${r.duplicates ? `, ${r.duplicates} repeated` : ""}${r.narration ? `, ${r.narration} narration` : ""} · ${r.steps ?? "?"} steps · ${r.ms ? `${Math.round(r.ms / 1000)}s` : "?"}${r.uncited ? ` · ${r.uncited} uncited` : ""}${r.repaired ? " · repaired" : ""}${r.writeUp ? ` · write-up (${r.writeUp})` : ""}`,
        );
        console.log(`      ${r.calls.map((x) => (x.ok ? x.name : `${x.name}✗`)).join(" → ") || "(no lookups)"}`);
        if (failed.length) console.log(`      failed: ${failed.join("; ")}`);
        if (process.argv.includes("--show-answers")) console.log(`      answer: ${r.answer.replace(/\s+/g, " ").slice(0, 400)}`);
      }
    }),
  );

  const s = summarize(results);
  console.log(
    `\n${s.passed}/${s.cases} passed · ${s.lookups} lookups (${s.failedLookups} failed, ${s.duplicates} repeated) · ${s.narration} narration parts · ${s.uncited} uncited · ${s.repaired} repaired · ${s.writeUps} write-ups · ${s.unanswered} unanswered · median ${s.medianMs ? Math.round(s.medianMs / 1000) : "?"}s · ${s.tokens.input} in / ${s.tokens.output} out tokens`,
  );

  const compare = arg("compare");
  if (compare) {
    const before = (JSON.parse(readFileSync(compare, "utf8")) as { results: EvalTurn[] }).results;
    const diff = compareRuns(before, results).filter((d) => d.change !== "same");
    console.log(diff.length ? `\nvs ${compare}:\n${diff.map((d) => `  ${d.change.padEnd(9)} ${d.id} (lookups ${d.lookups[0]} → ${d.lookups[1]})`).join("\n")}` : `\nvs ${compare}: no case changed pass/fail`);
  }

  mkdirSync(".artifacts/hoot-eval", { recursive: true });
  const out = `.artifacts/hoot-eval/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ model, at: new Date().toISOString(), skipped: skipped.map((c) => c.id), summary: s, results }, null, 2));
  console.log(`\nsaved ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

// Isolated local integration app: real APIs, SQL migrations, recorder, provider SDK, chat and citations.
// Auth, object storage, provider HTTP and company-file retrieval are deterministic test boundaries.
// No production env files are read and no authentication bypass is added to the Next app.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { controls, internalSource, providerFetch } from "./provider.mjs";
const root = process.cwd();
const out = resolve(root, ".artifacts/sell-side-test");
await mkdir(out, { recursive: true });
const pg = new PGlite();
globalThis.__sellSideDb = drizzle(pg);
globalThis.__sellSideAfter = [];
globalThis.__sellSideAudio = new Map();
globalThis.__sellSideInternal = internalSource;
const teamId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
await pg.exec("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);");
for (const file of [
  "0000_init.sql",
  "0003_holding_weights.sql",
  "0005_chat_runs.sql",
  "0011_sell_side.sql",
  "0014_sell_side_other_company.sql",
  "0014_sell_side_other_company.sql",
])
  await pg.exec(await readFile(resolve(root, "drizzle", file), "utf8"));
await pg.query("INSERT INTO auth.users(id) VALUES ($1)", [userId]);
await pg.query("INSERT INTO teams(id,slug,name) VALUES ($1,'tech','Technology')", [teamId]);
await pg.query("INSERT INTO profiles(id,email,full_name,role,team_id) VALUES ($1,'fixture@example.test','Analyst','admin',$2)", [userId, teamId]);
await pg.query("INSERT INTO holdings(id,team_id,ticker,company_name) VALUES ('22222222-2222-4222-8222-222222222222',$1,'AMZN','Amazon')", [teamId]);
process.env.OPENROUTER_API_KEY = "fixture-only";
process.env.OPENROUTER_MODEL = "fixture";
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (String(url).startsWith("https://openrouter.ai/") ? providerFetch(url, init) : originalFetch(url, init));
const serverModules = {
  "server-only": "",
  "next/server": "export const after = fn => globalThis.__sellSideAfter.push(fn);",
  "@/db/client": "export const db = globalThis.__sellSideDb;",
  "@/lib/settings": "export const getSetting = async () => null;",
  "@/lib/auth": `export const getCurrentUser = async () => ({ id: '${userId}', teamId: '${teamId}', fullName: 'Analyst', role: 'admin' }); export const canAccessTeam = (u,t) => u.teamId === t; export const transparencyEnabled = () => false;`,
  "@/lib/storage":
    "export const signModelUpload=async(path)=>({path,token:'fixture'}); export const downloadModelFile=async(path)=>globalThis.__sellSideAudio.get(path);",
  "@/lib/agent/tools": `export const makeTools=()=>({find_documents:{execute:async()=>({data:{documents:[{documentId:'model-fixture'}]},sources:[]})},search_documents:{execute:async()=>({data:{text:'FY26 revenue: $2.8 billion.'},sources:[globalThis.__sellSideInternal]})},read_document:{execute:async()=>({data:{text:'FY26 revenue: $2.8 billion.'},sources:[globalThis.__sellSideInternal]})}});`,
  "@/lib/agent/definition": `import {agentModel} from '@/lib/agent/model'; import {stepCountIs} from 'ai'; export const MAX_STEPS=2, FINAL_STEP=1; export const buildAgentDefinition=async()=>({model:await agentModel(),modelId:'fixture',instructions:'Answer from saved transcript evidence with citations.',tools:{},stopWhen:stepCountIs(2),maxRetries:0,maxOutputTokens:4000});`,
  "@/lib/agent/memory/distill": "export const distillTurn=async()=>null;",
  "@/lib/jobs/drive": "export const ensureDriveIndexFresh=async()=>{};",
  "@/lib/jobs/ingest": "export const ensureIngested=async()=>{};",
  "@/lib/documents/index": "export const getDocument=async()=>({id:'model-fixture',kind:'drive',title:'Internal company model'});",
  "@/lib/drive/index": "export const getFileText=async()=>({text:'FY26 revenue: $2.8 billion.'});",
};
const boundaries = (modules) => ({
  name: "test-boundaries",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => (args.path in modules ? { path: args.path, namespace: "fixture" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
      contents: modules[args.path],
      resolveDir: root,
    }));
  },
});
await build({
  stdin: {
    contents: `export * as create from './src/app/api/sell-side/route'; export * as call from './src/app/api/sell-side/[callId]/route'; export * as chat from './src/app/api/chat/route'; export * as chatState from './src/app/api/chat/[chatId]/route'; export * as source from './src/app/api/sources/[documentId]/route'; export * as store from './src/lib/sell-side/store'; export * as chats from './src/lib/chats';`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: resolve(out, "server.mjs"),
  plugins: [boundaries(serverModules)],
});
const api = await import(resolve(out, "server.mjs"));
await build({
  entryPoints: [resolve(root, "tests/sell-side/ui.tsx")],
  bundle: true,
  jsx: "automatic",
  outfile: resolve(out, "app.js"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    boundaries({
      "next/navigation":
        "const navigate=()=>window.dispatchEvent(new Event('navigate')); const router={refresh:navigate,push:url=>{history.pushState({},'',url);navigate();}}; export const useRouter=()=>router;",
      "@/lib/supabase/browser":
        "export const createSupabaseBrowser=()=>({storage:{from:()=>({uploadToSignedUrl:async(path,token,blob)=>{const r=await fetch('/test/upload?path='+encodeURIComponent(path),{method:'POST',body:blob});return {error:r.ok?null:new Error('Upload failed')}}})}});",
    }),
  ],
});
const css = await postcss([tailwind({ base: root })]).process(await readFile(resolve(root, "src/app/globals.css"), "utf8"), {
  from: resolve(root, "src/app/globals.css"),
});
await writeFile(resolve(out, "app.css"), css.css);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:4321");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(url, {
      method: req.method,
      ...(body.length ? { body, duplex: "half" } : {}),
      headers: { "content-type": "application/json" },
    });
    let response;
    const match = url.pathname.match(/^\/api\/sell-side\/(.+)$/);
    if (url.pathname === "/api/sell-side") response = await api.create.POST(request);
    else if (match)
      response = await api.call[req.method](request, {
        params: Promise.resolve({ callId: match[1] }),
      });
    else if (url.pathname === "/api/chat") response = await api.chat.POST(request);
    else if (url.pathname.startsWith("/api/chat/"))
      response = await api.chatState.GET(request, {
        params: Promise.resolve({ chatId: url.pathname.split("/").at(-1) }),
      });
    else if (url.pathname.startsWith("/api/sources/"))
      response = await api.source.GET(request, {
        params: Promise.resolve({ documentId: url.pathname.split("/").at(-1) }),
      });
    else if (url.pathname === "/test/upload") {
      globalThis.__sellSideAudio.set(url.searchParams.get("path"), body);
      controls.uploads++;
      response = Response.json({ ok: true });
    } else if (url.pathname === "/test/controls") {
      if (body.length) Object.assign(controls, JSON.parse(body));
      response = Response.json(controls);
    } else if (url.pathname === "/test/search")
      response = Response.json(await api.store.searchTranscripts(url.searchParams.get("team") || teamId, url.searchParams.get("ticker"), "revenue"));
    else if (url.pathname === "/test/state") {
      const id = url.searchParams.get("id");
      const call = /^[0-9a-f-]{36}$/.test(id) ? await api.store.getCall(id) : null;
      response = Response.json({
        call,
        messages: call ? await api.chats.loadMessages(call.chatId) : [],
        calls: await api.store.listCalls(teamId),
      });
    } else if (url.pathname === "/app.js" || url.pathname === "/app.css")
      response = new Response(await readFile(resolve(out, url.pathname.slice(1))), {
        headers: {
          "Content-Type": url.pathname.endsWith("css") ? "text/css" : "application/javascript",
        },
      });
    else
      response = new Response(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><title>Sell-side analyzer · local integration test</title></head><body class="font-sans" style="--font-inter:Arial"><div id="root"></div><script src="/app.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
    for (const task of globalThis.__sellSideAfter.splice(0)) Promise.resolve(typeof task === "function" ? task() : task).catch(console.error);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Local test server error");
  }
});
server.listen(4321, "127.0.0.1", () => console.log("Sell-side integration app: http://127.0.0.1:4321 (fixture services, real app modules and PostgreSQL)"));

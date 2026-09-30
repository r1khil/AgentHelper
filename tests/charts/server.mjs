import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const root = process.cwd();
const out = resolve(root, ".artifacts/charts-test");
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["tests/charts/ui.tsx"],
  outfile: resolve(out, "app.js"),
  bundle: true,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  // The chart adapters import layout controls which use next/link. The fixture has no Next router.
  plugins: [
    {
      name: "fixture-link",
      setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "next/link",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "import React from 'react'; export default function Link({href,scroll,prefetch,replace,children,...rest}) { return React.createElement('a',{href,...rest},children); } export const useLinkStatus = () => ({pending:false});",
          resolveDir: root,
        }));
      },
    },
  ],
});
const css = await postcss([tailwind({ base: root })]).process(
  await readFile(resolve(root, "src/app/globals.css"), "utf8"),
  { from: resolve(root, "src/app/globals.css") },
);
await writeFile(resolve(out, "app.css"), css.css);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:4322");
    if (url.pathname === "/app.js" || url.pathname === "/app.css") {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith("css") ? "text/css" : "application/javascript",
      );
      res.end(await readFile(resolve(out, url.pathname.slice(1))));
    } else if (url.pathname.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      const bars = [0, 1, 2, 3, 4].map((i) => ({
        t: `2026-09-25T${14 + i}:00:00Z`,
        close: 100 + i * 5,
      }));
      res.end(
        JSON.stringify({
          bars,
          points: bars.map((b, i) => ({ t: b.t, portfolio: i * 0.05 })),
        }),
      );
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><title>Chart interaction fixtures</title></head><body class="font-sans" style="--font-geist:Arial;--font-geist-mono:monospace"><div id="root"></div><script src="/app.js"></script></body></html>',
      );
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Fixture error");
  }
}).listen(4322, "127.0.0.1", () =>
  console.log(
    "Chart integration app: http://127.0.0.1:4322 (synthetic observations, real chart components)",
  ),
);

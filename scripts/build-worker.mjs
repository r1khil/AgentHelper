import { build } from "esbuild";
await build({
  entryPoints: [
    "scripts/worker.ts",
    "scripts/migrate.ts",
    "scripts/seed.ts",
    "scripts/replay.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  outdir: "dist",
  sourcemap: true,
});

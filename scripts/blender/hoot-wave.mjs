// Pack Hoot's wave loop (scripts/blender/hoot.py --wave <dir>) into one horizontal strip for the loading screen.
// Usage: node scripts/blender/hoot-wave.mjs <render dir>
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Pass the directory hoot.py --wave rendered into.");
const FRAME = 256;
const files = readdirSync(src).filter((f) => /^wave-\d+\.png$/.test(f)).sort();

// One square crop shared by every frame so Hoot doesn't jitter: the union of what each frame covers.
let box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
let size = 0;
for (const f of files) {
  const { info } = await sharp(path.join(src, f)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  size = (await sharp(path.join(src, f)).metadata()).width;
  const l = -info.trimOffsetLeft;
  const t = -info.trimOffsetTop;
  box = { l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, l + info.width), b: Math.max(box.b, t + info.height) };
}
const side = Math.min(size, Math.ceil(Math.max(box.r - box.l, box.b - box.t) * 1.04));
const left = Math.round(Math.min(Math.max((box.l + box.r) / 2 - side / 2, 0), size - side));
const top = Math.round(Math.min(Math.max((box.t + box.b) / 2 - side / 2, 0), size - side));

const frames = await Promise.all(
  files.map((f) => sharp(path.join(src, f)).extract({ left, top, width: side, height: side }).resize(FRAME).png().toBuffer()),
);
const out = "public/hoot/wave-loop.webp";
await sharp({ create: { width: FRAME * frames.length, height: FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames.map((input, i) => ({ input, left: i * FRAME, top: 0 })))
  .webp({ quality: 80, alphaQuality: 90, effort: 6 })
  .toFile(out);
console.log(`${files.length} frames of ${FRAME}px written to ${out}`);

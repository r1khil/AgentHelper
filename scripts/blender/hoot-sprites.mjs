// Turn Hoot's Blender renders (scripts/blender/hoot.py --render <dir>) into the web assets the app ships.
// Usage: node scripts/blender/hoot-sprites.mjs <render dir>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Pass the directory hoot.py rendered into.");
const out = "public/hoot";
mkdirSync(out, { recursive: true });

const webp = { quality: 82, alphaQuality: 90, effort: 6 };
const files = readdirSync(src).filter((f) => f.endsWith(".png"));
const meta = JSON.parse(readFileSync(path.join(src, "eyes.json"), "utf8"));

// One square crop shared by every layer (so they still line up): the union of what each pose covers,
// plus a little room for the page's squash-and-stretch.
let box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
for (const f of files) {
  const { info } = await sharp(path.join(src, f)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const l = -info.trimOffsetLeft;
  const t = -info.trimOffsetTop;
  box = { l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, l + info.width), b: Math.max(box.b, t + info.height) };
}
const size = meta.size;
const side = Math.min(size, Math.ceil(Math.max(box.r - box.l, box.b - box.t) * 1.04));
const cx = (box.l + box.r) / 2;
const cy = (box.t + box.b) / 2;
const left = Math.round(Math.min(Math.max(cx - side / 2, 0), size - side));
const top = Math.round(Math.min(Math.max(cy - side / 2, 0), size - side));
const crop = { left, top, width: side, height: side };

for (const f of files) {
  await sharp(path.join(src, f)).extract(crop).resize(384).webp(webp).toFile(path.join(out, f.replace(/\.png$/, ".webp")));
}

// Eye positions per pose in the cropped frame, bundled with the sprite component so pupils line up without a fetch.
const rescale = (v, offset) => Math.round(((v * size - offset) / side) * 10000) / 10000;
for (const pose of Object.values(meta.poses)) {
  for (const eye of Object.values(pose.eyes ?? {})) {
    eye.x = rescale(eye.x, left);
    eye.y = rescale(eye.y, top);
    eye.travel = Math.round(((eye.travel * size) / side) * 10000) / 10000;
  }
}
writeFileSync("src/components/app/hoot/eyes.json", JSON.stringify({ ...meta, size: 384 }, null, 2) + "\n");

// Flattened idle Hoot: the 3D hero's poster and fallback.
// (sharp runs extract before composite within one pipeline, so flatten first.)
const flat = await sharp(path.join(src, "idle.png")).composite([{ input: path.join(src, "idle-pupils.png") }]).png().toBuffer();
const idle = await sharp(flat).extract(crop).png().toBuffer();
await sharp(idle).resize(768).webp({ ...webp, quality: 85 }).toFile(path.join(out, "hoot-768.webp"));

// Tight square crop for the favicon and the sidebar mark.
const trimmed = await sharp(idle).trim().toBuffer();
const square = (px, background = { r: 0, g: 0, b: 0, alpha: 0 }) => sharp(trimmed).resize(px, px, { fit: "contain", background });
await square(192).png().toFile("src/app/icon.png");
await square(96).webp(webp).toFile(path.join(out, "mark.webp"));
// Apple icons can't be transparent: a cream tile with breathing room.
const apple = await square(140, { r: 250, g: 248, b: 244, alpha: 1 }).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#FAF8F4" } })
  .composite([{ input: apple, left: 20, top: 20 }])
  .flatten({ background: "#FAF8F4" })
  .png()
  .toFile("src/app/apple-icon.png");

console.log(`Hoot assets written to ${out} (crop ${side}px at ${left},${top})`);

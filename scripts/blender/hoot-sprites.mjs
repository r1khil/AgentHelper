// Turn Hoot's Blender renders (scripts/blender/hoot.py --render <dir>) into the web assets the app ships.
// Usage: node scripts/blender/hoot-sprites.mjs <render dir>
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Pass the directory hoot.py rendered into.");
const out = "public/hoot";
mkdirSync(out, { recursive: true });

const webp = { quality: 82, alphaQuality: 90, effort: 6 };

// Pose layers at 384px: base, blink and pupils per open pose, base only for closed poses.
for (const f of readdirSync(src).filter((f) => f.endsWith(".png"))) {
  await sharp(path.join(src, f)).resize(384).webp(webp).toFile(path.join(out, f.replace(/\.png$/, ".webp")));
}
copyFileSync(path.join(src, "eyes.json"), path.join(out, "eyes.json"));

// Flattened idle Hoot: the 3D hero's poster/fallback.
const idle = await sharp(path.join(src, "idle.png")).composite([{ input: path.join(src, "idle-pupils.png") }]).png().toBuffer();
await sharp(idle).webp({ ...webp, quality: 85 }).toFile(path.join(out, "hoot-768.webp"));

// Tight square crop of Hoot for the favicon and the sidebar mark.
const trimmed = await sharp(idle).trim().toBuffer();
const square = async (size, background) =>
  sharp(trimmed)
    .resize(size, size, { fit: "contain", background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } })
    .png();
await (await square(192)).toFile("src/app/icon.png");
await (await square(96)).webp(webp).toFile(path.join(out, "mark.webp"));
// Apple icons can't be transparent: cream tile with breathing room.
const apple = await (await square(140, { r: 250, g: 248, b: 244, alpha: 1 })).toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#FAF8F4" } })
  .composite([{ input: apple, left: 20, top: 20 }])
  .flatten({ background: "#FAF8F4" })
  .png()
  .toFile("src/app/apple-icon.png");

console.log("Hoot assets written to", out);

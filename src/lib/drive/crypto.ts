import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM with a key derived from DRIVE_TOKEN_KEY. Output: `v1:<iv>:<tag>:<ciphertext>` (base64). */
function keyBytes(secret: string) {
  if (!secret) throw new Error("DRIVE_TOKEN_KEY is not set");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function sealSecret(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function openSecret(sealed: string, secret: string) {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

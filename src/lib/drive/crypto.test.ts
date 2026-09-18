import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./crypto";

describe("sealSecret / openSecret", () => {
  const key = "test-key-0123456789";

  it("round-trips and uses a fresh IV each time", () => {
    const a = sealSecret("1//refresh-token", key);
    const b = sealSecret("1//refresh-token", key);
    expect(a).not.toBe(b);
    expect(openSecret(a, key)).toBe("1//refresh-token");
    expect(openSecret(b, key)).toBe("1//refresh-token");
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = sealSecret("secret", key);
    const parts = sealed.split(":");
    const tampered = [...parts.slice(0, 3), Buffer.from("xx" + Buffer.from(parts[3], "base64").toString("binary").slice(2), "binary").toString("base64")].join(":");
    expect(() => openSecret(tampered, key)).toThrow();
    expect(() => openSecret(sealed, "other-key")).toThrow();
    expect(() => openSecret("v0:a:b:c", key)).toThrow();
  });
});

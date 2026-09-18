import { describe, expect, it } from "vitest";
import { DRIVE_SCOPES, buildAuthUrl, hasRequiredScopes, parseFolderId } from "./oauth";

describe("buildAuthUrl", () => {
  const url = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "http://localhost:3000/api/google/callback", state: "abc" }));

  it("requests exactly the read-only and app-file scopes", () => {
    const scopes = new Set(url.searchParams.get("scope")!.split(" "));
    expect(scopes).toEqual(new Set(["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"]));
    expect(DRIVE_SCOPES).toHaveLength(2);
    expect(DRIVE_SCOPES.some((s) => /\/auth\/drive$/.test(s))).toBe(false);
  });

  it("asks for an offline refresh token and echoes state", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/google/callback");
  });
});

describe("hasRequiredScopes", () => {
  it("requires both scopes", () => {
    expect(hasRequiredScopes("https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file openid")).toBe(true);
    expect(hasRequiredScopes("https://www.googleapis.com/auth/drive.readonly")).toBe(false);
    expect(hasRequiredScopes(undefined)).toBe(false);
  });
});

describe("parseFolderId", () => {
  it("accepts folder URLs, id query strings, and bare ids", () => {
    expect(parseFolderId("https://drive.google.com/drive/folders/1AbC_dEf-GhIjK?usp=sharing")).toBe("1AbC_dEf-GhIjK");
    expect(parseFolderId("https://drive.google.com/open?id=1AbC_dEf-GhIjK")).toBe("1AbC_dEf-GhIjK");
    expect(parseFolderId("  1AbC_dEf-GhIjK ")).toBe("1AbC_dEf-GhIjK");
    expect(parseFolderId("not a folder")).toBeNull();
    expect(parseFolderId("")).toBeNull();
  });
});

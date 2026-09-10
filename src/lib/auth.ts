import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db/client";
import { hash } from "./service";
import type { Actor } from "./access";
export function developmentAuth() {
  const enabled = process.env.AUTH_MODE === "development";
  if (
    enabled &&
    (process.env.NODE_ENV === "production" || process.env.CONTAINER_APP_NAME)
  )
    throw Error("Development authentication is forbidden in deployment");
  return enabled;
}
export function appUrl() {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw Error("HTTPS APP_URL required");
  return url.origin;
}
export async function csrf() {
  const origin = (await headers()).get("origin");
  if (origin !== appUrl()) throw Error("Request origin rejected");
}
const opts = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
export async function actor(): Promise<Actor | null> {
  developmentAuth();
  const token = (await cookies()).get("ah_session")?.value;
  if (!token) return null;
  const [u] =
    await db()`select u.* from auth_session s join app_user u on u.id=s.user_id where s.token_hash=${hash(token)} and s.expires_at>now()`;
  if (!u) return null;
  if (!developmentAuth() && u.subject.startsWith("dev:")) return null;
  return { id: u.id, name: u.name, email: u.email, admin: u.admin };
}
export async function requireActor() {
  const a = await actor();
  if (!a) redirect("/login");
  return a;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db()`insert into auth_session(token_hash,user_id,expires_at) values(${hash(token)},${userId},now()+interval '8 hours')`;
  const jar = await cookies();
  const old = jar.get("ah_session")?.value;
  if (old) await db()`delete from auth_session where token_hash=${hash(old)}`;
  jar.set("ah_session", token, { ...opts(), maxAge: 28800 });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("ah_session")?.value;
  if (token)
    await db()`delete from auth_session where token_hash=${hash(token)}`;
  jar.delete("ah_session");
}
function config() {
  const tenant = process.env.ENTRA_TENANT_ID,
    subdomain = process.env.ENTRA_SUBDOMAIN,
    client = process.env.ENTRA_CLIENT_ID,
    secret = process.env.ENTRA_CLIENT_SECRET;
  if (
    !tenant ||
    !subdomain ||
    !client ||
    !secret ||
    !/^[a-zA-Z0-9-]+$/.test(subdomain) ||
    !/^[a-fA-F0-9-]{36}$/.test(tenant)
  )
    throw Error("Entra sign-in is not configured");
  return {
    tenant,
    subdomain,
    client,
    secret,
    authority: `https://${subdomain}.ciamlogin.com/${tenant}/v2.0`,
  };
}
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw Error("AUTH_SECRET must contain at least 32 random characters");
  return createHash("sha256").update(secret).digest();
}
let discovery:
  | Promise<{
      authorization_endpoint: string;
      token_endpoint: string;
      jwks_uri: string;
      issuer: string;
    }>
  | undefined;
async function metadata() {
  const c = config();
  return (discovery ??= fetch(
    `${c.authority}/.well-known/openid-configuration`,
    { cache: "no-store", signal: AbortSignal.timeout(15000) },
  )
    .then(async (r) => {
      if (!r.ok) throw Error("Identity discovery unavailable");
      const m = await r.json();
      for (const name of [
        "authorization_endpoint",
        "token_endpoint",
        "jwks_uri",
        "issuer",
      ]) {
        const u = new URL(m[name]);
        if (u.protocol !== "https:" || !u.hostname.endsWith(".ciamlogin.com"))
          throw Error("Unexpected identity endpoint");
      }
      return m;
    })
    .catch((error) => {
      discovery = undefined;
      throw error;
    }));
}
export async function beginLogin() {
  const c = config(),
    m = await metadata();
  const state = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const flow = await new EncryptJWT({ state, nonce, verifier })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(key());
  (await cookies()).set("ah_oidc", flow, { ...opts(), maxAge: 600 });
  const url = new URL(m.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: c.client,
    response_type: "code",
    redirect_uri: `${appUrl()}/auth/callback`,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
export async function finishLogin(url: URL) {
  const jar = await cookies();
  const flow = jar.get("ah_oidc")?.value;
  jar.delete("ah_oidc");
  if (!flow || !url.searchParams.get("code"))
    throw Error("Missing authorization flow");
  const { payload } = await jwtDecrypt(flow, key());
  if (payload.state !== url.searchParams.get("state"))
    throw Error("Invalid authorization state");
  const c = config(),
    m = await metadata();
  const response = await fetch(m.token_endpoint, {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.client,
      client_secret: c.secret,
      grant_type: "authorization_code",
      code: url.searchParams.get("code")!,
      redirect_uri: `${appUrl()}/auth/callback`,
      code_verifier: String(payload.verifier),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("Token exchange failed");
  const tokens = await response.json();
  const { payload: claims } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(m.jwks_uri)),
    {
      issuer: m.issuer,
      audience: c.client,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
    },
  );
  if (claims.nonce !== payload.nonce || !claims.sub)
    throw Error("Invalid identity nonce");
  const subject = `${m.issuer}|${claims.sub}`;
  const name = typeof claims.name === "string" ? claims.name : "Analyst",
    email = typeof claims.email === "string" ? claims.email : "";
  const [user] =
    await db()`insert into app_user(subject,name,email) values(${subject},${name.slice(0, 200)},${email.slice(0, 320)}) on conflict(subject) do update set name=excluded.name returning id`;
  await createSession(user.id);
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  csrf,
  requireActor,
  developmentAuth,
  createSession,
  logout,
} from "@/lib/auth";
import { assertAdmin } from "@/lib/access";
import * as service from "@/lib/service";
import { replay } from "@/lib/engine";
import { drain, makeBriefings } from "@/lib/jobs";
import { db } from "@/db/client";
import { IDS } from "@/lib/seed";
const value = (f: FormData, k: string) => String(f.get(k) ?? "");
export async function localLogin(f: FormData) {
  await csrf();
  if (!developmentAuth()) throw Error("Local login disabled");
  const id = z
    .enum([IDS.admin, IDS.analyst, IDS.outsider])
    .parse(value(f, "user"));
  await createSession(id);
  redirect("/");
}
export async function signOut() {
  await csrf();
  await logout();
  redirect("/login");
}
export async function mutate(f: FormData) {
  await csrf();
  const a = await requireActor();
  const op = value(f, "op");
  const returnTo = value(f, "returnTo");
  const path =
    /^\/(?:teams|investigations)\/[a-f0-9-]{36}$/.test(returnTo) ||
    ["/admin", "/join", "/"].includes(returnTo)
      ? returnTo
      : "/";
  let error = "";
  try {
    switch (op) {
      case "holding":
        await service.saveHolding(a, {
          teamId: value(f, "teamId"),
          id: value(f, "id") || undefined,
          ticker: value(f, "ticker").toUpperCase(),
          kind: value(f, "kind"),
          ownerId: value(f, "ownerId") || null,
          peers: value(f, "peers"),
          priorUpdates: value(f, "priorUpdates"),
          questions: value(f, "questions"),
        });
        break;
      case "thesis":
        await service.proposeThesis(
          a,
          value(f, "holdingId"),
          value(f, "content"),
        );
        break;
      case "approve":
        await service.approveThesis(a, value(f, "id"));
        break;
      case "reasoning":
        await service.saveReasoning(
          a,
          value(f, "id"),
          value(f, "reasoning"),
          f.has("noCatalyst"),
        );
        break;
      case "review":
        await service.reviewReasoning(a, value(f, "id"));
        break;
      case "note":
        await service.addNote(a, value(f, "id"), value(f, "content"));
        break;
      case "complete":
        await service.complete(
          a,
          value(f, "id"),
          f.getAll("sourceId").map(String),
        );
        break;
      case "evaluate":
        await service.evaluate(
          a,
          value(f, "id"),
          Number(value(f, "minutes")),
          Number(value(f, "tracing")),
          Number(value(f, "reasoningScore")),
          value(f, "comment"),
        );
        break;
      case "join":
        await service.acceptInvitation(a, value(f, "token"));
        break;
      case "replay":
        await replay(a);
        await drain();
        await makeBriefings("2026-09-11");
        await drain();
        break;
      case "worker":
        assertAdmin(a);
        await drain();
        break;
      case "retry":
        assertAdmin(a);
        await db()`update job set status='pending',attempts=0,run_at=now(),lease_token=null,lease_until=null where id=${value(f, "id")} and status='failed'`;
        break;
      default:
        throw Error("Unknown action");
    }
  } catch (e) {
    error =
      e instanceof z.ZodError
        ? "Please check the form fields."
        : e instanceof Error
          ? e.message
          : "Unable to save";
    if (error.length > 180)
      error = "Unable to save. Check input and try again.";
  }
  revalidatePath("/", "layout");
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}
export async function invite(f: FormData) {
  await csrf();
  const a = await requireActor();
  const token = await service.createInvitation(
    a,
    value(f, "teamId"),
    value(f, "email"),
    value(f, "role"),
  );
  redirect(`/admin?invitation=${encodeURIComponent(token)}`);
}

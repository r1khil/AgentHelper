import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weeklyRequests, weeklyUpdates, type WeeklyRequest, type WeeklyUpdate } from "@/db/schema";
import { normalizeFigures } from "./figures";
import { emptyAgenda, type WeeklyAgenda, type WeeklyFigures, type WeeklySources } from "./types";
import { isFriday } from "./weeks";

export async function getPack(weekEnding: string): Promise<WeeklyUpdate | null> {
  const [row] = await db.select().from(weeklyUpdates).where(eq(weeklyUpdates.weekEnding, weekEnding)).limit(1);
  return row ?? null;
}

export async function listPacks(limit = 26): Promise<WeeklyUpdate[]> {
  return db.select().from(weeklyUpdates).orderBy(desc(weeklyUpdates.weekEnding)).limit(limit);
}

/** Create the row for a week if it is not there yet, and return it either way. */
export async function ensurePack(weekEnding: string): Promise<WeeklyUpdate> {
  if (!isFriday(weekEnding)) throw new Error(`Week ending must be a Friday, got ${weekEnding}`);
  await db.insert(weeklyUpdates).values({ weekEnding }).onConflictDoNothing({ target: weeklyUpdates.weekEnding });
  const row = await getPack(weekEnding);
  if (!row) throw new Error(`Could not create the pack for ${weekEnding}`);
  return row;
}

export async function listRequests(weekEnding: string): Promise<WeeklyRequest[]> {
  return db.select().from(weeklyRequests).where(eq(weeklyRequests.weekEnding, weekEnding)).orderBy(weeklyRequests.recipientEmail);
}

export function packAgenda(row: Pick<WeeklyUpdate, "agenda">): WeeklyAgenda {
  return normalizeAgenda(row.agenda);
}

export function packLastWeekAgenda(row: Pick<WeeklyUpdate, "lastWeekAgenda">): WeeklyAgenda {
  return normalizeAgenda(row.lastWeekAgenda);
}

export function packFigures(row: Pick<WeeklyUpdate, "figures">): WeeklyFigures {
  return normalizeFigures(row.figures);
}

/** A row written before a section existed, or with a null blob, still reads as an empty agenda. */
export function normalizeAgenda(raw: unknown): WeeklyAgenda {
  const base = emptyAgenda();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<Record<keyof WeeklyAgenda, unknown>>;
  for (const key of Object.keys(base) as (keyof WeeklyAgenda)[]) {
    const list = src[key];
    if (!Array.isArray(list)) continue;
    base[key] = list
      .filter((i): i is { day?: unknown; text: unknown } => Boolean(i) && typeof i === "object")
      .map((i) => ({ day: typeof i.day === "string" && i.day ? i.day : null, text: String(i.text ?? "") }))
      .filter((i) => i.text.trim().length > 0);
  }
  return base;
}

export function noteSource(sources: WeeklySources, step: string, entry: Omit<WeeklySources[string], "at">): WeeklySources {
  return { ...sources, [step]: { ...entry, at: new Date().toISOString() } };
}

/** Marks the pack as touched by a person, which is what stops the Sunday job overwriting it. */
export async function markEdited(weekEnding: string, editedBy: string | null) {
  const now = new Date();
  await db.update(weeklyUpdates).set({ editedAt: now, editedBy, updatedAt: now }).where(eq(weeklyUpdates.weekEnding, weekEnding));
}

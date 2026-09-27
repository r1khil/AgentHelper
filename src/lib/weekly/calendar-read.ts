import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles } from "@/db/schema";
import { driveConfigured } from "@/lib/drive/auth";
import { downloadFile } from "@/lib/drive/read";
import { readWorkbook } from "@/lib/excel/read";
import { calendarEntries, type CalendarEntry } from "./fund-calendar";

/**
 * The fund's semester calendar, read from the app's Drive folder (a download, never a write). Each semester gets a new
 * file ("Fall 2026 Calendar.xlsx", then "Spring 2027 Calendar.xlsx"), so the two newest are read and the newer wins a day
 * both cover: a new semester's file can arrive before the old one ends.
 */
const CALENDAR_FILE = "^(fall|spring|summer) [0-9]{4} calendar\\.xlsx$";

export async function readFundCalendar(): Promise<{ entries: CalendarEntry[]; files: string[] } | null> {
  if (!driveConfigured()) return null;
  const files = await db
    .select({ id: driveFiles.id, name: driveFiles.name })
    .from(driveFiles)
    .where(and(eq(driveFiles.isFolder, false), sql`${driveFiles.name} ~* ${CALENDAR_FILE}`))
    .orderBy(desc(driveFiles.modifiedTime))
    .limit(2);
  const byDate = new Map<string, CalendarEntry>();
  // Oldest first, so the newer file overwrites any day both have.
  for (const f of [...files].reverse()) {
    const book = await readWorkbook(await downloadFile(f.id), { maxRows: 80, maxCols: 10 });
    for (const e of calendarEntries(book.sheets)) byDate.set(e.date, e);
  }
  return { entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), files: files.map((f) => f.name) };
}

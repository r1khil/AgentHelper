import type { Source } from "@/lib/providers/types";

/** Sections of an earnings prep pack, in display order. */
export const PREP_SECTION_KEYS = ["last_quarter", "prior_guidance", "consensus", "team_questions", "watch_items", "not_retrieved"] as const;
export type PrepSectionKey = (typeof PREP_SECTION_KEYS)[number];

export type PrepBullet = { text: string; sourceIds: string[] };
export type PrepSection = { key: PrepSectionKey; title: string; bullets: PrepBullet[] };

/** Evidence gathered before an earnings report. Never contains the student's expectations or a predicted outcome. */
export type PrepPack = { reportDate: string; sections: PrepSection[]; sources: Source[]; builtAt: string; model: string };

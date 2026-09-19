import type { DriveDocKind } from "./tree";

export const DOC_KIND_LABELS: Record<DriveDocKind, string> = {
  initiating_coverage: "Initiating coverage",
  earnings_update: "Earnings update",
  model: "Model",
  other: "Other",
};

/** A display subtype only: keep stored kinds and existing search/upload filters intact. */
export type DocumentLabelInput = {
  kind: DriveDocKind | null;
  name: string;
  documentHeading?: string | null;
};

export const DOCUMENT_HEADING_CHARS = 1200;

function labelFromTitle(title: string): string | null {
  // Drive filenames commonly use underscores and typographic/nonbreaking hyphens.
  const normalized = title.normalize("NFKC").replace(/[_\u2010-\u2015\u2212-]+/g, " ");
  if (/\btranscripts?\b/i.test(normalized)) return "Earnings transcript";
  if (/\bpre\s*earnings\b|\bearnings\s+(preview|prep(?:aration)?)\b/i.test(normalized)) return "Pre-earnings";
  if (/\bmajor\s+movements?\b/i.test(normalized)) return "Major movement";
  if (/\bearnings\s+(update|deck|presentation|review|recap|results)\b|\bresults\s+(presentation|deck)\b/i.test(normalized)) return "Earnings update";
  return null;
}

/** Shared by every company's document shelf and the agent's document metadata. */
export function documentLabel(file: DocumentLabelInput): string {
  if (file.kind !== "earnings_update") return file.kind ? DOC_KIND_LABELS[file.kind] : "Other";
  const named = labelFromTitle(file.name);
  if (named && named !== "Earnings update") return named;

  // Generic exported filenames can hide the type. Consult only short opening headings
  // from the current cached document, never folder names, summaries, or body mentions.
  for (const line of (file.documentHeading ?? "").slice(0, DOCUMENT_HEADING_CHARS).split(/\r?\n/).filter((line) => line.trim()).slice(0, 8)) {
    const heading = line.trim();
    if (heading.length > 160 || /\b(see|refer|according|previous|prior|discussed|reviewed)\b/i.test(heading)) continue;
    const label = labelFromTitle(heading);
    if (label) return label;
  }
  return DOC_KIND_LABELS.earnings_update;
}

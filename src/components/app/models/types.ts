import type { WorkbookInfo } from "@/lib/excel/read";

/** A holding in the models list: its latest model, or none yet. */
export type ModelListItem = {
  holdingId: string;
  ticker: string;
  companyName: string;
  teamName: string | null;
  model: null | {
    id: string;
    href: string;
    fileName: string;
    version: number;
    versions: number;
    uploader: string | null;
    createdAt: Date;
    proposed: number;
    approved: number;
    exceptions: number;
    mappings: number;
  };
};

export type UploadTarget = { id: string; ticker: string; companyName: string; hasModel: boolean };

export type ModelProposalRow = {
  id: string;
  label: string;
  sheet: string;
  cellRef: string;
  concept: string;
  taxonomy: string;
  /** YYYY-MM-DD */
  periodEnd: string;
  fiscalPeriod: string | null;
  value: number | null;
  reportedLabel: string | null;
  derivation: string | null;
  exceptionReason: string | null;
  sourceUrl: string | null;
  accession: string | null;
  filedAt: string | null;
  status: "proposed" | "approved" | "rejected" | "exception";
  reviewer: string | null;
};

export type ModelMappingRow = {
  id: string;
  labelInModel: string;
  sheet: string;
  rowRef: number;
  concept: string;
  unit: string;
  scale: number;
  sign: number;
  periodType: string;
  periodColumns: Record<string, string>;
  rationale: string | null;
};

export type ModelTab = "proposals" | "mappings" | "map";

export type ModelDetailData = {
  id: string;
  ticker: string;
  companyName: string;
  holdingHref: string;
  fileName: string;
  version: number;
  nextVersion: number;
  uploader: string | null;
  createdAt: Date;
  cik: string | null;
  versions: { id: string; version: number; href: string }[];
  downloadHref: string;
  /** The detail URL; tabs add ?tab= to it. */
  href: string;
  tab: ModelTab;
  mappings: ModelMappingRow[];
  proposals: ModelProposalRow[];
  workbook: WorkbookInfo;
  ok: string | null;
  error: string | null;
};

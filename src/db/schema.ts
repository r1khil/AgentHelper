import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { GICS_SECTORS } from "../lib/attribution/sectors";
import type { JobProgressEvent } from "../lib/jobs/progress-types";
import type { DocSummary } from "../lib/drive/summary";
import type { Source } from "../lib/providers/types";
import type { PrepPack } from "../lib/agent/prep-types";
import type { AgendaItem, WeeklyAgenda, WeeklyChart, WeeklyFigures, WeeklyPerformers, WeeklySources } from "../lib/weekly/types";

// Supabase-managed auth schema; referenced for the profiles FK only.
const auth = pgSchema("auth");
export const authUsers = auth.table("users", { id: uuid("id").primaryKey() });

export const roleEnum = pgEnum("role", ["associate_analyst", "lead_analyst", "exec", "admin"]);
export const accountKindEnum = pgEnum("account_kind", ["google", "password"]);
export const holdingStatusEnum = pgEnum("holding_status", ["active", "exited"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "ok", "skipped", "failed"]);
export const movementStatusEnum = pgEnum("movement_status", ["open", "in_progress", "completed"]);
export const evidenceStatusEnum = pgEnum("evidence_status", ["pending", "ready"]);
export const evidenceKindEnum = pgEnum("evidence_kind", ["news", "filing", "peer_move", "price", "financial", "release"]);
export const dateStatusEnum = pgEnum("date_status", ["confirmed", "estimated"]);
export const earningsStatusEnum = pgEnum("earnings_status", ["upcoming", "reported", "reviewed"]);
export const periodTypeEnum = pgEnum("period_type", ["quarterly", "annual"]);
export const proposalStatusEnum = pgEnum("proposal_status", ["proposed", "approved", "rejected", "exception"]);
export const notificationKindEnum = pgEnum("notification_kind", ["movement_alert", "reminder", "overdue", "earnings"]);
export const gicsSectorEnum = pgEnum("gics_sector", GICS_SECTORS);
export const tradeSideEnum = pgEnum("trade_side", ["buy", "sell"]);
export const tradeKindEnum = pgEnum("trade_kind", ["opening", "trade"]);
export const cashFlowKindEnum = pgEnum("cash_flow_kind", ["deposit", "withdrawal", "fee", "interest"]);
export const driveDocKindEnum = pgEnum("drive_doc_kind", ["initiating_coverage", "earnings_update", "model", "other"]);
export const holdingProposalStatusEnum = pgEnum("holding_proposal_status", ["pending", "accepted", "dismissed"]);
export const securityEventKindEnum = pgEnum("security_event_kind", ["dividend", "split"]);
export const sectorSourceEnum = pgEnum("sector_source", ["yahoo", "default", "manual"]);
export const documentKindEnum = pgEnum("document_kind", ["drive", "filing", "web"]);
export const weeklyStatusEnum = pgEnum("weekly_status", ["draft", "sent"]);

/**
 * pgvector halfvec without a typmod: vectors from models of different lengths coexist in one column, and each
 * model gets its own partial HNSW index over `embedding::halfvec(<dims>)` (see ensureEmbeddingIndex).
 */
const halfvecAny = customType<{ data: number[]; driverData: string }>({
  dataType: () => "extensions.halfvec",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => JSON.parse(value) as number[],
});

const sqlActive = sql`status = 'active'`;

export type Feedback = {
  at: string;
  model: string;
  onText: string;
  unsupported: string[];
  missing: string[];
  alternatives: string[];
  contradictions: string[];
  questions: string[];
};

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  fullName: text("full_name").notNull(),
  role: roleEnum("role").notNull().default("associate_analyst"),
  kind: accountKindEnum("kind").notNull().default("google"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  // First-sign-in setup. Null until the member finishes the onboarding steps.
  boundaryAcknowledgedAt: timestamp("boundary_acknowledged_at", { withTimezone: true }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // Exec/admin preference: show how the agent, attribution and jobs are computed. Role is enforced server-side.
  transparencyMode: boolean("transparency_mode").notNull().default(false),
  // Hoot, the companion: shown or hidden, and which nudges this member has already dismissed.
  hoot: jsonb("hoot").$type<import("../lib/hoot/types").HootState>().notNull().default({}),
  ...timestamps,
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: roleEnum("role").notNull().default("associate_analyst"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps,
});

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    companyName: text("company_name").notNull(),
    cik: text("cik"),
    /** @deprecated Unused since 2026-09-28: a holding belongs to its whole team. Kept (with its old values) so no data is dropped; the app neither reads nor writes it. */
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    thesis: text("thesis"),
    thesisUpdatedAt: timestamp("thesis_updated_at", { withTimezone: true }),
    // Derived from the trade ledger once one exists; fractional because dividends reinvest.
    shares: numeric("shares", { precision: 18, scale: 6 }),
    weightPct: numeric("weight_pct", { precision: 6, scale: 2 }),
    status: holdingStatusEnum("status").notNull().default("active"),
    addedAt: date("added_at").notNull().defaultNow(),
    exitedAt: date("exited_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("holdings_team_ticker_active").on(t.teamId, t.ticker).where(sqlActive)],
);

export const holdingNotes = pgTable("holding_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  holdingId: uuid("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => profiles.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  ...timestamps,
});

export const dailyCloses = pgTable(
  "daily_closes",
  {
    ticker: text("ticker").notNull(),
    sessionDate: date("session_date").notNull(),
    close: numeric("close", { precision: 18, scale: 6 }).notNull(),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.sessionDate] })],
);

// Attribution. The trade ledger is the source of truth for what the Fund owned and when.
export const securities = pgTable("securities", {
  ticker: text("ticker").primaryKey(),
  name: text("name").notNull(),
  sector: gicsSectorEnum("sector"),
  sectorSource: sectorSourceEnum("sector_source"),
  yahooSector: text("yahoo_sector"),
  industry: text("industry"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  ...timestamps,
});

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tradeDate: date("trade_date").notNull(),
    ticker: text("ticker").notNull().references(() => securities.ticker),
    side: tradeSideEnum("side").notNull(),
    kind: tradeKindEnum("kind").notNull().default("trade"),
    // As executed, not split-adjusted.
    shares: numeric("shares", { precision: 18, scale: 6 }).notNull(),
    price: numeric("price", { precision: 18, scale: 6 }).notNull(),
    fees: numeric("fees", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("trades_ticker_date").on(t.ticker, t.tradeDate),
    check("trades_positive", sql`${t.shares} > 0 and ${t.price} > 0 and ${t.fees} >= 0`),
  ],
);

export const cashFlows = pgTable(
  "cash_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowDate: date("flow_date").notNull(),
    kind: cashFlowKindEnum("kind").notNull(),
    // Always positive; the kind carries the sign.
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [check("cash_flows_positive", sql`${t.amount} > 0`)],
);

export const securityEvents = pgTable(
  "security_events",
  {
    ticker: text("ticker").notNull(),
    exDate: date("ex_date").notNull(),
    kind: securityEventKindEnum("kind").notNull(),
    // Dividend per share, on the same split-adjusted basis as daily_closes.
    amount: numeric("amount", { precision: 18, scale: 6 }),
    // Split: new shares per old share.
    ratio: numeric("ratio", { precision: 12, scale: 6 }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.exDate, t.kind] })],
);

export const benchmarkSectorWeights = pgTable(
  "benchmark_sector_weights",
  {
    asOf: date("as_of").notNull(),
    sector: gicsSectorEnum("sector").notNull(),
    weightPct: numeric("weight_pct", { precision: 7, scale: 4 }).notNull(),
    source: text("source"),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.asOf, t.sector] })],
);

// Each GICS sector belongs to at most one team; defines a team's benchmark.
export const teamSectors = pgTable("team_sectors", {
  sector: gicsSectorEnum("sector").primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
});

// Top constituents of each sector SPDR and their next report date: the names that move a sector
// whether or not the Fund owns them. Refreshed by the morning job.
export const sectorBellwethers = pgTable(
  "sector_bellwethers",
  {
    ticker: text("ticker").primaryKey(),
    sector: gicsSectorEnum("sector").notNull(),
    etf: text("etf").notNull(),
    name: text("name").notNull(),
    weightPct: numeric("weight_pct", { precision: 7, scale: 4 }),
    industry: text("industry"),
    reportDate: date("report_date"),
    reportHour: text("report_hour"),
    dateStatus: dateStatusEnum("date_status"),
    epsEstimate: numeric("eps_estimate", { precision: 12, scale: 4 }),
    dateSourceUrl: text("date_source_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sector_bellwethers_sector").on(t.sector)],
);

export const movementRuns = pgTable("movement_runs", {
  sessionDate: date("session_date").primaryKey(),
  status: runStatusEnum("status").notNull().default("pending"),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const movements = pgTable(
  "movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdingId: uuid("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    holdingReturnPct: numeric("holding_return_pct", { precision: 10, scale: 4 }),
    spxReturnPct: numeric("spx_return_pct", { precision: 10, scale: 4 }),
    relativeMovePp: numeric("relative_move_pp", { precision: 10, scale: 4 }),
    status: movementStatusEnum("status").notNull().default("open"),
    /** @deprecated Unused since 2026-09-28: a write-up belongs to the holding's whole team (see completedBy for who finished it). Kept so no data is dropped; the app neither reads nor writes it. */
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("pending"),
    dataQuality: text("data_quality"),
    updateText: text("update_text"),
    feedback: jsonb("feedback").$type<Feedback>(),
    completedBy: uuid("completed_by").references(() => profiles.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("movements_holding_session").on(t.holdingId, t.sessionDate)],
);

export const earnings = pgTable(
  "earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdingId: uuid("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
    fiscalPeriod: text("fiscal_period"),
    reportDate: date("report_date").notNull(),
    reportHour: text("report_hour"),
    dateStatus: dateStatusEnum("date_status").notNull().default("estimated"),
    dateSourceUrl: text("date_source_url"),
    epsEstimate: numeric("eps_estimate", { precision: 12, scale: 4 }),
    revenueEstimate: numeric("revenue_estimate", { precision: 20, scale: 2 }),
    /** ISO codes for the two estimates, which can differ (TSM: EPS per ADR in USD, revenue in TWD). Null = unknown. */
    epsCurrency: text("eps_currency"),
    revenueCurrency: text("revenue_currency"),
    expectations: text("expectations"),
    keyQuestions: text("key_questions"),
    thesisChangeCriteria: text("thesis_change_criteria"),
    preLockedAt: timestamp("pre_locked_at", { withTimezone: true }),
    actuals: jsonb("actuals").$type<Record<string, unknown>>(),
    gatheredAt: timestamp("gathered_at", { withTimezone: true }),
    reflection: text("reflection"),
    feedback: jsonb("feedback").$type<Feedback>(),
    reflectionBy: uuid("reflection_by").references(() => profiles.id, { onDelete: "set null" }),
    reflectionAt: timestamp("reflection_at", { withTimezone: true }),
    /** Agent-built evidence pack for the upcoming report; evidence and questions only, never expectations. */
    prepPack: jsonb("prep_pack").$type<PrepPack>(),
    prepPackAt: timestamp("prep_pack_at", { withTimezone: true }),
    prepPackModel: text("prep_pack_model"),
    prepPackError: text("prep_pack_error"),
    status: earningsStatusEnum("status").notNull().default("upcoming"),
    ...timestamps,
  },
  (t) => [uniqueIndex("earnings_holding_report").on(t.holdingId, t.reportDate)],
);

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  movementId: uuid("movement_id").references(() => movements.id, { onDelete: "cascade" }),
  earningsId: uuid("earnings_id").references(() => earnings.id, { onDelete: "cascade" }),
  kind: evidenceKindEnum("kind").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  publisher: text("publisher"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "set null" }),
  title: text("title").notNull().default("New chat"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** idle | running | error — whether the agent is still answering the last question. */
  runStatus: text("run_status").notNull().default("idle"),
  runStartedAt: timestamp("run_started_at", { withTimezone: true }),
  /** Set once Hoot reads the price target sheet in this chat: only execs and admins may list, open or continue it. */
  fundOnly: boolean("fund_only").notNull().default(false),
  ...timestamps,
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    seq: integer("seq").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("chat_messages_chat_seq").on(t.chatId, t.seq)],
);

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdingId: uuid("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    parentId: uuid("parent_id"),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    sheets: jsonb("sheets").$type<unknown>(),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("models_holding_version").on(t.holdingId, t.version)],
);

export const modelMappings = pgTable("model_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  sheet: text("sheet").notNull(),
  rowRef: integer("row_ref").notNull(),
  labelInModel: text("label_in_model").notNull(),
  concept: text("concept").notNull(),
  taxonomy: text("taxonomy").notNull().default("us-gaap"),
  unit: text("unit").notNull().default("USD"),
  scale: integer("scale").notNull().default(1),
  sign: integer("sign").notNull().default(1),
  periodType: periodTypeEnum("period_type").notNull().default("quarterly"),
  periodColumns: jsonb("period_columns").$type<Record<string, string>>().notNull().default({}),
  anchorColumn: text("anchor_column"),
  rationale: text("rationale"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps,
});

export const modelProposals = pgTable("model_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  mappingId: uuid("mapping_id").notNull().references(() => modelMappings.id, { onDelete: "cascade" }),
  periodEnd: date("period_end").notNull(),
  cellRef: text("cell_ref").notNull(),
  value: numeric("value", { precision: 24, scale: 6 }),
  unit: text("unit"),
  reportedLabel: text("reported_label"),
  fiscalPeriod: text("fiscal_period"),
  sourceUrl: text("source_url"),
  accession: text("accession"),
  filedAt: date("filed_at"),
  derivation: text("derivation"),
  status: proposalStatusEnum("status").notNull().default("proposed"),
  exceptionReason: text("exception_reason"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
});

export const modelWrites = pgTable("model_writes", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  fromVersion: integer("from_version").notNull(),
  toVersion: integer("to_version").notNull(),
  proposalIds: uuid("proposal_ids").array().notNull(),
  writtenBy: uuid("written_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps,
});

export const providerCache = pgTable("provider_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  /** Step events appended while the job runs; see src/lib/jobs/progress.ts. */
  progress: jsonb("progress").$type<JobProgressEvent[]>().notNull().default([]),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: notificationKindEnum("kind").notNull(),
  recipientId: uuid("recipient_id").references(() => profiles.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  refId: uuid("ref_id"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  ...timestamps,
});

// Google Drive connection (admin's account, read-all + add-only) and the index of the shared folder.
export const driveConnection = pgTable(
  "drive_connection",
  {
    id: smallint("id").primaryKey().default(1),
    accountEmail: text("account_email").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").array().notNull(),
    rootFolderId: text("root_folder_id"),
    rootFolderName: text("root_folder_name"),
    connectedBy: uuid("connected_by").references(() => profiles.id, { onDelete: "set null" }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncStartedAt: timestamp("sync_started_at", { withTimezone: true }),
    lastError: text("last_error"),
    // Change notifications (Drive changes.watch) and the changes.list cursor.
    startPageToken: text("start_page_token"),
    channelId: text("channel_id"),
    channelResourceId: text("channel_resource_id"),
    channelSecret: text("channel_secret"),
    channelExpiration: timestamp("channel_expiration", { withTimezone: true }),
    watchError: text("watch_error"),
    changeNotifiedAt: timestamp("change_notified_at", { withTimezone: true }),
    lastChangeSyncAt: timestamp("last_change_sync_at", { withTimezone: true }),
    ingestStartedAt: timestamp("ingest_started_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [check("drive_connection_single", sql`${t.id} = 1`)],
);

export const driveFiles = pgTable(
  "drive_files",
  {
    id: text("id").primaryKey(), // Google Drive file id
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    parentId: text("parent_id"),
    path: text("path").notNull(), // relative to the root folder
    isFolder: boolean("is_folder").notNull().default(false),
    size: bigint("size", { mode: "number" }),
    modifiedTime: timestamp("modified_time", { withTimezone: true }),
    webViewLink: text("web_view_link"),
    md5: text("md5"),
    ticker: text("ticker"),
    holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "set null" }),
    kind: driveDocKindEnum("kind"),
    createdByApp: boolean("created_by_app").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    /** The corpus row holding this file's text, summary and embedding bookkeeping; equals the file id for non-folders. */
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("drive_files_holding").on(t.holdingId), index("drive_files_parent").on(t.parentId), index("drive_files_ticker").on(t.ticker)],
);

// The searchable corpus: every document the agent can cite by id, whatever its origin. Drive rows reuse the Drive
// file id so existing citations keep resolving; filings use a random id. `version` is the freshness key (Drive
// modifiedTime, filing accession); a step is current when its `*_for` column equals `version`.
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    kind: documentKindEnum("kind").notNull(),
    /** drive: file id; filing: `${accession}/${documentName}`; web: canonical URL. */
    externalId: text("external_id").notNull(),
    holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "set null" }),
    ticker: text("ticker"),
    title: text("title").notNull(),
    url: text("url"),
    publisher: text("publisher"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    docDate: date("doc_date"),
    /** 10-K, 10-Q, 8-K, EX-99.1 for filings. */
    form: text("form"),
    /** Which parts of a long filing were kept, for the reader. */
    sectionNote: text("section_note"),
    version: text("version").notNull(),
    text: text("text"),
    textFor: text("text_for"),
    textError: text("text_error"),
    // Structured summary extracted by the app (Drive documents only).
    summary: jsonb("summary").$type<DocSummary>(),
    summaryModel: text("summary_model"),
    summaryVersion: smallint("summary_version"),
    summaryFor: text("summary_for"),
    summaryError: text("summary_error"),
    summarizedAt: timestamp("summarized_at", { withTimezone: true }),
    // Embedding bookkeeping; the chunks live in document_chunks.
    embedModel: text("embed_model"),
    embedFor: text("embed_for"),
    embedError: text("embed_error"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    ingestAttempts: smallint("ingest_attempts").notNull().default(0),
    ingestAttemptedAt: timestamp("ingest_attempted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("documents_kind_external").on(t.kind, t.externalId), index("documents_holding").on(t.holdingId), index("documents_ticker").on(t.ticker), index("documents_kind_published").on(t.kind, t.publishedAt)],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "set null" }),
    ticker: text("ticker"),
    seq: integer("seq").notNull(),
    /** Item label for filing sections (e.g. "Item 1A"). */
    section: text("section"),
    text: text("text").notNull(),
    embedding: halfvecAny("embedding").notNull(),
    model: text("model").notNull(),
    /** Generated in SQL: to_tsvector('english', text). Never written by the app. */
    tsv: text("tsv"),
    ...timestamps,
  },
  (t) => [uniqueIndex("document_chunks_document_seq").on(t.documentId, t.seq), index("document_chunks_holding").on(t.holdingId), index("document_chunks_ticker").on(t.ticker)],
);

// Values the app extracted from a team document and proposes for a holding field; nothing changes until accepted.
export const holdingProposals = pgTable(
  "holding_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    field: text("field").$type<"thesis">().notNull(),
    proposed: text("proposed").notNull(),
    rationale: text("rationale"),
    sourceFileId: text("source_file_id").references(() => driveFiles.id, { onDelete: "set null" }),
    sourceFileName: text("source_file_name"),
    sourceModifiedTime: timestamp("source_modified_time", { withTimezone: true }),
    status: holdingProposalStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("holding_proposals_one_pending").on(t.holdingId, t.field).where(sql`${t.status} = 'pending'`), index("holding_proposals_holding").on(t.holdingId)],
);

export type Team = typeof teams.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Earnings = typeof earnings.$inferSelect;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type Model = typeof models.$inferSelect;
export type ModelMapping = typeof modelMappings.$inferSelect;
export type ModelProposal = typeof modelProposals.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type Bellwether = typeof sectorBellwethers.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
export type CashFlowRow = typeof cashFlows.$inferSelect;
export type Role = Profile["role"];
export type DriveFile = typeof driveFiles.$inferSelect;
export type DriveConnection = typeof driveConnection.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type DocumentKind = DocumentRow["kind"];
export type HoldingProposal = typeof holdingProposals.$inferSelect;
export type DriveDocKind = DriveFile["kind"] & string;

// Fund-wide settings chosen on the Admin page (for example which model the research agent uses).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per pull request merged into main, with a plain-English summary written once by the
// research agent's (free) model. The Changelog page for execs and admins reads from here.
export const changelogEntries = pgTable("changelog_entries", {
  prNumber: integer("pr_number").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  url: text("url").notNull(),
  mergedAt: timestamp("merged_at", { withTimezone: true }).notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChangelogEntry = typeof changelogEntries.$inferSelect;

/** Team-owned calls reuse chats for summaries, follow-ups, and citation persistence. */
export const sellSideCalls = pgTable("sell_side_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  holdingId: uuid("holding_id").references(() => holdings.id),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }).unique(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  ticker: text("ticker").notNull(),
  status: text("status").notNull().default("recording"),
  expectedParts: integer("expected_parts"),
  error: text("error"),
  lease: uuid("lease"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, t => [index("sell_side_calls_team").on(t.teamId, t.createdAt)]);

export const sellSideParts = pgTable("sell_side_parts", {
  callId: uuid("call_id").notNull().references(() => sellSideCalls.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type").notNull(),
  offset: numeric("offset").notNull(),
  duration: numeric("duration").notNull(),
  segments: jsonb("segments").$type<import("../lib/sell-side/types").Segment[]>(),
  text: text("text"),
  summary: text("summary"),
}, t => [primaryKey({ columns: [t.callId, t.seq] })]);

// Agent memory. `log` rows summarize one answered question; `fact` rows are cited findings; `lesson`
// rows are tool-usage knowledge. Facts carry the date of their newest evidence and the last time a
// later turn agreed with them, so every reader can judge their age.
export type MemoryScope = "holding" | "team" | "fund";
export type MemoryKind = "log" | "fact" | "lesson";
export type MemoryMeta = { question?: string; nextQuestions?: string[]; chatId?: string; earningsId?: string };

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<MemoryScope>().notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MemoryKind>().notNull(),
    body: text("body").notNull(),
    sources: jsonb("sources").$type<Source[]>().notNull().default([]),
    meta: jsonb("meta").$type<MemoryMeta>(),
    sourceChatId: uuid("source_chat_id").references(() => chats.id, { onDelete: "set null" }),
    embedding: halfvecAny("embedding"),
    model: text("model"),
    /** Which embedding model produced `embedding`; semantic recall only compares vectors from the current model. */
    embedModel: text("embed_model"),
    /** publishedAt of the newest cited source: when the fact was last true per its evidence. */
    evidenceAt: timestamp("evidence_at", { withTimezone: true }),
    /** Last time a later turn's distilled fact matched this row. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    createdBy: text("created_by").notNull().default("agent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("agent_memories_holding").on(t.holdingId, t.kind, t.createdAt), index("agent_memories_team_scope").on(t.teamId, t.scope)],
);
export type AgentMemory = typeof agentMemories.$inferSelect;

// Remote MCP servers an admin registered. The auth header value comes from process.env[authEnv]; it is never stored.
export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  url: text("url").notNull(),
  authEnv: text("auth_env"),
  enabled: boolean("enabled").notNull().default(true),
  toolPrefix: text("tool_prefix").notNull(),
  allowedTools: text("allowed_tools").array(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** Tool names seen on the last successful connection, for the Admin page. */
  toolNames: text("tool_names").array(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});
export type McpServer = typeof mcpServers.$inferSelect;

/**
 * The weekly portfolio update pack, one row per Friday the week ended on. The agent fills the
 * evidence (performers, earnings, market news) and rolls last week's agenda forward; the execs own
 * every number in `figures` and every word in `agenda`. `editedAt` and `status = 'sent'` are what
 * the Sunday job checks before it writes anything.
 */
export const weeklyUpdates = pgTable("weekly_updates", {
  weekEnding: date("week_ending").primaryKey(),
  status: weeklyStatusEnum("status").notNull().default("draft"),
  figures: jsonb("figures").$type<WeeklyFigures>(),
  performers: jsonb("performers").$type<WeeklyPerformers>(),
  agenda: jsonb("agenda").$type<WeeklyAgenda>(),
  lastWeekAgenda: jsonb("last_week_agenda").$type<WeeklyAgenda>(),
  /** Unused until the app may read the price target sheet; the YTD chart is pasted by hand. */
  chart: jsonb("chart").$type<WeeklyChart>(),
  /** One entry per build step, so a partial pack says which part failed. */
  sources: jsonb("sources").$type<WeeklySources>().notNull().default({}),
  builtAt: timestamp("built_at", { withTimezone: true }),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  editedBy: uuid("edited_by").references(() => profiles.id, { onDelete: "set null" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentBy: uuid("sent_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});
export type WeeklyUpdate = typeof weeklyUpdates.$inferSelect;

/** One process-update ask per exec per week, and the reply it came back with. */
export const weeklyRequests = pgTable(
  "weekly_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekEnding: date("week_ending").notNull().references(() => weeklyUpdates.weekEnding, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").references(() => profiles.id, { onDelete: "set null" }),
    recipientEmail: text("recipient_email").notNull(),
    /** Random per request; it is what makes a reply address unguessable. */
    token: text("token").notNull().unique(),
    replyAddress: text("reply_address").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sendError: text("send_error"),
    resendId: text("resend_id"),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    /** Unique, so a webhook Resend delivers twice is applied once. */
    replyEmailId: text("reply_email_id").unique(),
    replyFrom: text("reply_from"),
    /** The exec's own words, quoted reply stripped, stored before any parsing is attempted. */
    replyText: text("reply_text"),
    parsedItems: jsonb("parsed_items").$type<AgendaItem[]>(),
    parseModel: text("parse_model"),
    parseError: text("parse_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("weekly_requests_week_recipient").on(t.weekEnding, t.recipientEmail)],
);
export type WeeklyRequest = typeof weeklyRequests.$inferSelect;

/** A what-if rebalance saved from the Backtesting page, shared by link. Team null is the whole Fund. */
export const backtestScenarios = pgTable(
  "backtest_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    note: text("note"),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    /** Hash of the saved holdings the scenario started from. */
    baseVersion: text("base_version").notNull(),
    /** Scenario weights in percent by ticker, including CASH. */
    weights: jsonb("weights").$type<Record<string, number>>().notNull(),
    /** The saved weights at the time, in percent by ticker. */
    baseWeights: jsonb("base_weights").$type<Record<string, number>>().notNull(),
    added: jsonb("added").$type<{ ticker: string; name: string }[]>().notNull().default([]),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    benchmark: text("benchmark").notNull(),
    ...timestamps,
  },
  (t) => [index("backtest_scenarios_scope").on(t.teamId, t.createdAt)],
);
export type BacktestScenario = typeof backtestScenarios.$inferSelect;


/**
 * Full holdings of the ETFs the Fund owns, plus SPY and the sector SPDRs, one list per ETF and as-of date.
 * Weights are percent of the ETF's net assets; cash, collateral and derivatives aren't stored, so a list's
 * weights add up to its coverage. Refreshed weekly by the price job (src/lib/lookthrough/store.ts).
 */
export const etfConstituents = pgTable(
  "etf_constituents",
  {
    etf: text("etf").notNull(),
    asOf: date("as_of").notNull(),
    /** Yahoo-style: BRK-B, K.TO, 000660.KS. */
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    weight: numeric("weight", { precision: 10, scale: 6 }).notNull(),
    sector: gicsSectorEnum("sector"),
    /** ssga | ishares | first-trust | roundhill | yahoo-top10 */
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "etf_constituents_pkey", columns: [t.etf, t.asOf, t.symbol] }),
    index("etf_constituents_symbol").on(t.symbol),
    check("etf_constituents_weight_positive", sql`${t.weight} > 0`),
  ],
);
export type EtfConstituent = typeof etfConstituents.$inferSelect;

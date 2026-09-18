import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
  vector,
} from "drizzle-orm/pg-core";
import { GICS_SECTORS } from "../lib/attribution/sectors";
import type { JobProgressEvent } from "../lib/jobs/progress-types";
import type { DocSummary } from "../lib/drive/summary";

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
    text: text("text"),
    textModifiedTime: timestamp("text_modified_time", { withTimezone: true }),
    textError: text("text_error"),
    // Structured summary extracted by the app, keyed on modified_time like the text cache.
    summary: jsonb("summary").$type<DocSummary>(),
    summaryModel: text("summary_model"),
    summaryVersion: smallint("summary_version"),
    summaryModifiedTime: timestamp("summary_modified_time", { withTimezone: true }),
    summaryError: text("summary_error"),
    summarizedAt: timestamp("summarized_at", { withTimezone: true }),
    docDate: date("doc_date"),
    // Embedding bookkeeping; the chunks live in drive_chunks.
    embedModel: text("embed_model"),
    embedModifiedTime: timestamp("embed_modified_time", { withTimezone: true }),
    embedError: text("embed_error"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    ingestAttempts: smallint("ingest_attempts").notNull().default(0),
    ingestAttemptedAt: timestamp("ingest_attempted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("drive_files_holding").on(t.holdingId), index("drive_files_parent").on(t.parentId), index("drive_files_ticker").on(t.ticker)],
);

export const driveChunks = pgTable(
  "drive_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: text("file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    holdingId: uuid("holding_id").references(() => holdings.id, { onDelete: "set null" }),
    ticker: text("ticker"),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    model: text("model").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("drive_chunks_file_seq").on(t.fileId, t.seq),
    index("drive_chunks_holding").on(t.holdingId),
    index("drive_chunks_ticker").on(t.ticker),
    index("drive_chunks_embedding").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
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
export type DriveChunk = typeof driveChunks.$inferSelect;
export type HoldingProposal = typeof holdingProposals.$inferSelect;
export type DriveDocKind = DriveFile["kind"] & string;

// Fund-wide settings chosen on the Admin page (for example which model the research agent uses).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

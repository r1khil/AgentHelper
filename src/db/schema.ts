import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export type Team = typeof teams.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Earnings = typeof earnings.$inferSelect;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type Model = typeof models.$inferSelect;
export type ModelMapping = typeof modelMappings.$inferSelect;
export type ModelProposal = typeof modelProposals.$inferSelect;
export type Role = Profile["role"];

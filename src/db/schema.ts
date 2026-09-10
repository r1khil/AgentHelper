import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  jsonb,
  integer,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const users = pgTable("app_user", {
  id: id(),
  subject: text("subject").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  admin: boolean("admin").notNull().default(false),
});
export const teams = pgTable("team", {
  id: id(),
  name: text("name").notNull().unique(),
});
export const memberships = pgTable(
  "membership",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
  },
  (t) => [uniqueIndex("membership_unique").on(t.teamId, t.userId)],
);
export const invitations = pgTable("invitation", {
  id: id(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: time("expires_at"),
  acceptedBy: uuid("accepted_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});
export const sessions = pgTable("auth_session", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: time("expires_at"),
});
export const holdings = pgTable(
  "holding",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    securityId: text("security_id").notNull(),
    ticker: text("ticker").notNull(),
    kind: text("kind").notNull(),
    ownerId: uuid("owner_id").references(() => users.id),
    peers: text("peers").notNull().default(""),
    priorUpdates: text("prior_updates").notNull().default(""),
    questions: text("questions").notNull().default(""),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
  },
  (t) => [uniqueIndex("holding_team_security").on(t.teamId, t.securityId)],
);
export const theses = pgTable("thesis", {
  id: id(),
  holdingId: uuid("holding_id")
    .notNull()
    .references(() => holdings.id),
  content: text("content").notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: time("created_at"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});
export const policies = pgTable("fund_policy", {
  version: text("version").primaryKey(),
  config: jsonb("config").notNull(),
  createdAt: time("created_at"),
});
export const observations = pgTable("market_observation", {
  id: id(),
  securityId: text("security_id").notNull(),
  session: text("session").notNull(),
  value: numeric("value"),
  previousClose: numeric("previous_close"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  provider: text("provider").notNull(),
  quality: text("quality").notNull(),
  raw: jsonb("raw").notNull(),
  createdAt: time("created_at"),
});
export const qualityFailures = pgTable(
  "quality_failure",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id),
    session: text("session").notNull(),
    message: text("message").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [uniqueIndex("quality_holding_session").on(t.holdingId, t.session)],
);
export const events = pgTable(
  "movement_event",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id),
    session: text("session").notNull(),
    eventType: text("event_type").notNull().default("closing"),
    holdingObservationId: uuid("holding_observation_id")
      .notNull()
      .references(() => observations.id),
    benchmarkObservationId: uuid("benchmark_observation_id")
      .notNull()
      .references(() => observations.id),
    holdingReturn: numeric("holding_return").notNull(),
    spxReturn: numeric("spx_return").notNull(),
    relativeMove: numeric("relative_move").notNull(),
    policyVersion: text("policy_version")
      .notNull()
      .references(() => policies.version),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("event_unique").on(
      t.teamId,
      t.holdingId,
      t.session,
      t.eventType,
    ),
  ],
);
export const investigations = pgTable("investigation", {
  id: id(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => events.id),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  ownerId: uuid("owner_id").references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }),
  configurationError: text("configuration_error"),
  status: text("status").notNull().default("open"),
  update: text("analyst_update").notNull().default(""),
  noCatalyst: boolean("no_catalyst").notNull().default(false),
  completedBy: uuid("completed_by").references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: time("created_at"),
});
export const sources = pgTable(
  "source",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id),
    key: text("source_key").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull(),
    url: text("url"),
    publishedAt: time("published_at"),
    retrievedAt: time("retrieved_at"),
    location: text("location").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull(),
    catalystAt: timestamp("catalyst_at", { withTimezone: true }),
    synthetic: boolean("synthetic").notNull().default(true),
  },
  (t) => [uniqueIndex("source_unique").on(t.teamId, t.key)],
);
export const facts = pgTable(
  "evidence_fact",
  {
    id: id(),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    location: text("location").notNull(),
  },
  (t) => [uniqueIndex("fact_unique").on(t.investigationId, t.sourceId, t.kind)],
);
export const notes = pgTable("analyst_note", {
  id: id(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: time("created_at"),
});
export const feedback = pgTable("reasoning_feedback", {
  id: id(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  reasoning: text("reasoning").notNull(),
  result: jsonb("result").notNull(),
  createdAt: time("created_at"),
});
export const completionSources = pgTable(
  "completion_source",
  {
    id: id(),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (t) => [
    uniqueIndex("completion_source_unique").on(t.investigationId, t.sourceId),
  ],
);
export const jobs = pgTable(
  "job",
  {
    id: id(),
    key: text("job_key").notNull().unique(),
    kind: text("kind").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    runAt: time("run_at"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: time("created_at"),
  },
  (t) => [index("job_claim_idx").on(t.status, t.runAt)],
);
export const jobAttempts = pgTable("job_attempt", {
  id: id(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  attempt: integer("attempt").notNull(),
  outcome: text("outcome").notNull(),
  error: text("error"),
  createdAt: time("created_at"),
});
export const deliveries = pgTable("delivery", {
  id: id(),
  key: text("delivery_key").notNull().unique(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  investigationId: uuid("investigation_id").references(() => investigations.id),
  kind: text("kind").notNull(),
  recipients: jsonb("recipients").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("captured"),
  createdAt: time("created_at"),
});
export const briefings = pgTable(
  "briefing",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    day: text("day").notNull(),
    sourceIds: jsonb("source_ids").notNull(),
    eventIds: jsonb("event_ids").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [uniqueIndex("briefing_team_day").on(t.teamId, t.day)],
);
export const briefingItems = pgTable("briefing_item", {
  key: text("item_key").primaryKey(),
  briefingId: uuid("briefing_id")
    .notNull()
    .references(() => briefings.id),
});
export const audit = pgTable("audit_event", {
  id: id(),
  teamId: uuid("team_id").references(() => teams.id),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  target: text("target").notNull(),
  details: jsonb("details").notNull(),
  createdAt: time("created_at"),
});
export const evaluations = pgTable("evaluation", {
  id: id(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  minutes: integer("minutes").notNull(),
  sourceTracing: integer("source_tracing").notNull(),
  reasoning: integer("reasoning").notNull(),
  comment: text("comment").notNull(),
  createdAt: time("created_at"),
});

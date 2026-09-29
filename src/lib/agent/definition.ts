import "server-only";
import { isStepCount, type LanguageModel, type ModelMessage, type ToolChoice, type ToolSet } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { Source } from "@/lib/providers/types";
import type { TraceSink } from "@/lib/trace/context";
import { AGENT_MODELS, agentModelId, chatModel } from "./model";
import { buildInstructions } from "./instructions";
import { makeTools } from "./tools";
import { instrumentTools } from "./trace";
import { withModelFallback } from "./fallback";
import { compactForStep } from "./turn";
import { repairToolCall } from "./tool-repair";
import { loadMcpTools } from "./mcp";
import { makePortfolioTools } from "./portfolio-tools";
import { makeWorkspaceTools } from "./workspace-tools";
import { makeFredTools } from "./fred-tools";
import { fredConfigured } from "@/lib/providers/fred";
import { makeWikipediaTools } from "./wikipedia-tools";
import { makePredictionMarketTools } from "./prediction-markets-tools";
import { makeSandboxTools } from "./sandbox-tools";
import { makeAppTools } from "./app-tools";
import { makeChangeTools } from "./change-tools";
import { isProposalTool, proposalToolsFor } from "@/lib/hoot/proposals";
import { makePtSheetTools, ptSheetToolAllowed, type PtSheetState } from "./pt-sheet-tools";
import { PT_SHEET_MODEL_ID, sheetSafeModel } from "./pt-sheet-guard";
import type { PageContext } from "./page-context";
import type { CurrentUser } from "@/lib/auth";

/** Steps the model may spend on tools; the last step is forced to be a written answer. */
export const MAX_STEPS = 10;
export const FINAL_STEP = MAX_STEPS - 1;
/** Tool results from the most recent N steps go to the model in full; older ones are shrunk. */
export const KEEP_FULL_STEPS = 2;

export type AgentPurpose = "chat" | "prep";

export type AgentContext = {
  /** Null for a fund-wide conversation: every team's holdings, only execs and admins. */
  teamId: string | null;
  holdingId: string | null;
  user: { id: string; fullName: string; role: string };
  /** Sources from earlier turns, so filing reads can keep their titles and dates. */
  sources?: Source[];
  sink?: TraceSink | null;
  purpose?: AgentPurpose;
  /** The signed-in member behind a chat turn; enables the portfolio and workspace-page tools under their access rules. */
  viewer?: CurrentUser | null;
  /** Where the member asked from (Hoot attaches it). */
  page?: PageContext | null;
  /** The saved chat this turn belongs to; the PT sheet tool needs it to make the chat fund-only. */
  chatId?: string | null;
  /** The conversation already holds PT sheet data, so every model call stays on the sheet-safe model. */
  sheetInHistory?: boolean;
  /** Nothing is written to the research log (evaluation runs): `remember` refuses. */
  memoryOff?: boolean;
  /** The member's own messages in this chat, newest first: which changes Hoot may propose, and pasted ticket text. */
  memberTexts?: string[];
};

export type AgentDefinition = {
  /** The admin's primary model id, for metadata; fallbacks may have answered. */
  modelId: string;
  /** The model id to record once the turn is over: the sheet-safe model when the PT sheet was in play. */
  answeredBy: () => string;
  model: LanguageModel;
  instructions: string;
  tools: ToolSet;
  stopWhen: ReturnType<typeof isStepCount>;
  prepareStep: (o: { stepNumber: number; messages: ModelMessage[] }) => { toolChoice?: ToolChoice<ToolSet>; instructions?: string; messages?: ModelMessage[] } | undefined;
  maxRetries: number;
  maxOutputTokens: number;
  /** Fixes tool arguments written as broken JSON before they fail a step. */
  repairToolCall: typeof repairToolCall;
};

/** Primary first, then the rest of the admin list, so a rate-limited free model hands off to another. */
export function fallbackOrder(primary: string): string[] {
  return [primary, ...AGENT_MODELS.map((m) => m.id).filter((id) => id !== primary)];
}

export const FINAL_STEP_NUDGE = `Your research budget for this question is used up. Write the final answer now from the evidence you already have, with citations, and list under "Not retrieved" anything you could not get.`;

/** Per-step settings shared by chat turns and jobs: shrink stale tool output, force prose on the last step. */
export function prepareAgentStep(instructions: string, finalNudge = FINAL_STEP_NUDGE): AgentDefinition["prepareStep"] {
  return ({ stepNumber, messages }) => {
    const compacted = stepNumber > KEEP_FULL_STEPS ? compactForStep(messages, KEEP_FULL_STEPS) : messages;
    const changed = compacted !== messages ? compacted : undefined;
    if (stepNumber >= FINAL_STEP) return { toolChoice: "none", instructions: `${instructions}\n\n${finalNudge}`, messages: changed };
    return changed ? { messages: changed } : undefined;
  };
}

/**
 * Everything one agent run needs, built once per request from the database: the model with its
 * fallbacks, the prompt, the tools (traced when a sink is given), and the loop settings.
 * `runAgentTurn` spreads it into streamText; background jobs spread it into generateText.
 */
/** The admin's model wrapped with the fallback chain; shared by chat turns, repair, distillation and jobs. */
export async function agentModelWithFallback(sink?: TraceSink | null): Promise<{ modelId: string; model: LanguageModel }> {
  const primary = await agentModelId();
  const model = withModelFallback(fallbackOrder(primary), (id) => chatModel(id) as unknown as LanguageModelV4, (e) => sink?.emit({ t: "model.fallback", ...e }));
  return { modelId: primary, model };
}

export async function buildAgentDefinition(ctx: AgentContext): Promise<AgentDefinition> {
  const { modelId: primary, model: chain } = await agentModelWithFallback(ctx.sink);
  // Once the PT sheet is in the conversation (read this turn or earlier), only the sheet-safe model sees it.
  const sheet: PtSheetState = { read: Boolean(ctx.sheetInHistory) };
  const sheetTool = ptSheetToolAllowed(ctx);
  let safe: LanguageModelV4 | undefined;
  const model: LanguageModel =
    sheetTool || sheet.read ? sheetSafeModel(chain as unknown as LanguageModelV4, () => (safe ??= chatModel(PT_SHEET_MODEL_ID) as unknown as LanguageModelV4), () => sheet.read) : chain;
  const native = {
    ...makeTools({ teamId: ctx.teamId, holdingId: ctx.holdingId, userId: ctx.user.id, sources: ctx.sources, memoryBlocked: () => sheet.read, memoryOff: ctx.memoryOff }),
    ...(ctx.viewer ? makePortfolioTools({ viewer: ctx.viewer, teamId: ctx.teamId }) : {}),
    ...(ctx.viewer ? makeWorkspaceTools({ viewer: ctx.viewer, teamId: ctx.teamId }) : {}),
    ...(fredConfigured() ? makeFredTools() : {}),
    ...makeWikipediaTools(),
    ...makePredictionMarketTools(),
    ...(ctx.viewer ? makeSandboxTools({ viewer: ctx.viewer, teamId: ctx.teamId }) : {}),
    ...(sheetTool && ctx.chatId ? makePtSheetTools({ chatId: ctx.chatId, state: sheet }) : {}),
    // Operating the app is for a member in a chat, never a background job.
    ...(ctx.viewer && (ctx.purpose ?? "chat") === "chat" ? makeAppTools({ viewer: ctx.viewer, page: ctx.page }) : {}),
    // Proposing changes to the member's data, likewise chat-only, and only the ones their latest message asks for.
    ...(ctx.viewer && (ctx.purpose ?? "chat") === "chat"
      ? makeChangeTools({
          viewer: ctx.viewer,
          chat: ctx.chatId ? { id: ctx.chatId, holdingId: ctx.holdingId } : null,
          memberTexts: ctx.memberTexts ?? [],
          allowed: proposalToolsFor(ctx.memberTexts?.[0] ?? ""),
          // Evaluation runs save nothing, the audit trail included.
          audit: !ctx.memoryOff,
        })
      : {}),
  };
  // Admin-registered MCP servers add tools under their prefix; a native name always wins.
  const mcp = await loadMcpTools();
  const merged: ToolSet = { ...mcp.tools, ...native };
  const tools = ctx.sink ? instrumentTools(merged, ctx.sink) : merged;
  const instructions = await buildInstructions(ctx.teamId, {
    holdingId: ctx.holdingId,
    userName: ctx.user.fullName,
    userRole: ctx.user.role,
    purpose: ctx.purpose ?? "chat",
    portfolioTools: Boolean(ctx.viewer),
    workspaceTools: Boolean(ctx.viewer),
    ptSheet: sheetTool,
    page: ctx.page ?? null,
    changeTools: Object.keys(native).filter(isProposalTool),
    externalTools: mcp.servers.length ? { servers: mcp.servers, instructions: mcp.instructions, toolNames: Object.keys(mcp.tools) } : undefined,
  });
  return {
    modelId: primary,
    answeredBy: () => (sheet.read ? PT_SHEET_MODEL_ID : primary),
    model,
    instructions,
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    prepareStep: prepareAgentStep(instructions),
    maxRetries: 2,
    // Reasoning models spend part of this before writing; 4000 cut long answers off mid-table.
    maxOutputTokens: 10_000,
    repairToolCall,
  };
}

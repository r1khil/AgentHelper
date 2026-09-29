import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { toolCatalog } from "./tool-routing";
import type { ToolResult } from "./tools";

/**
 * The escape hatch for tool routing (./tool-routing): each chat step offers only the tools its question seems to need,
 * and a regex router will sometimes guess wrong. find_tools lists everything else registered for this turn and turns
 * on what the model asks for, from its next step on, so a missed word costs one step instead of an answer that says
 * the data can't be retrieved. `requested` is shared with the step router.
 */
export function makeFindTools(ctx: { available: readonly string[]; requested: Set<string> }) {
  const catalog = toolCatalog(ctx.available);
  return {
    find_tools: tool({
      description: `Turn on tools you were not offered this step. You see only the tools this question seemed to need; these others are registered and work once turned on (from your next step). Call it before ever telling the member you can't retrieve something, then call the tools you turned on. Pass tool names, or a group name for the whole group:\n${catalog.lines.map((l) => `- ${l}`).join("\n")}`,
      inputSchema: z.object({ tools: z.array(z.string().max(80)).min(1).max(20).describe("Tool names or group names from the list") }),
      execute: async ({ tools }): Promise<ToolResult<unknown>> => {
        const { enabled, unknown } = catalog.resolve(tools);
        for (const t of enabled) ctx.requested.add(t);
        if (!enabled.length) return { data: null, sources: [], error: `None of ${tools.join(", ")} is a tool or group you can turn on${unknown.length ? "" : " (they may already be on)"}. Pick from the list in this tool's description.` };
        return { data: { enabled, ...(unknown.length ? { unknown } : {}), note: "These are available from your next step: call them now." }, sources: [] };
      },
    }),
  };
}

import { describe, expect, it } from "vitest";
import { InvalidToolInputError, NoSuchToolError } from "ai";
import { repairToolInputText, toolErrorText } from "./tool-repair";

describe("repairToolInputText", () => {
  it("fixes fences, trailing commas and an object cut off mid-string", () => {
    expect(repairToolInputText('```json\n{"ticker": "AXP", "days": 7,}\n```')).toBe('{"ticker":"AXP","days":7}');
    expect(repairToolInputText('{"ticker": "AXP", "query": "co-brand')).toBe('{"ticker":"AXP","query":"co-brand"}');
    expect(repairToolInputText("")).toBe("{}");
  });
  it("leaves valid JSON and hopeless text alone", () => {
    expect(repairToolInputText('{"ticker": 7}')).toBeNull();
    expect(repairToolInputText("read_filing url=https://x")).toBeNull();
    expect(repairToolInputText('["AXP"')).toBeNull();
  });
});

describe("toolErrorText", () => {
  it("shows the model's own mistakes and hides everything else", () => {
    const invalid = new InvalidToolInputError({ toolName: "get_news", toolInput: "{", cause: new Error("Expected number, received string\\nat days") });
    expect(toolErrorText(invalid)).toBe("Invalid arguments for get_news: Expected number, received string\\nat days");
    expect(toolErrorText(new NoSuchToolError({ toolName: "read_drive_file" }))).toBe("There is no tool named read_drive_file.");
    expect(toolErrorText(new Error("OpenRouter 502 at https://internal"))).toBe("An error occurred.");
  });
  it("reads the message-only form and names the bad argument", () => {
    const sdk = 'Invalid input for tool get_news: AI_TypeValidationError: Type validation failed: Value: {"days":90}.\nError message: [{"origin":"number","code":"too_big","maximum":60,"path":["days"],"message":"Too big: expected number to be <=60"}]';
    expect(toolErrorText(sdk)).toBe("Invalid arguments for get_news: days: Too big: expected number to be <=60");
    expect(toolErrorText(`AI_InvalidToolInputError: ${sdk}`)).toBe("Invalid arguments for get_news: days: Too big: expected number to be <=60");
    expect(toolErrorText(new Error(sdk))).toBe("Invalid arguments for get_news: days: Too big: expected number to be <=60");
    expect(toolErrorText("Model tried to call unavailable tool 'read_drive_file'. Available tools: get_news.")).toBe("There is no tool named read_drive_file.");
  });
});

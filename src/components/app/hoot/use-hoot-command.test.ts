import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), setTheme: vi.fn(), success: vi.fn(), error: vi.fn(), resolvedTheme: "dark" }));
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: mocks.resolvedTheme, setTheme: mocks.setTheme }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useHootCommand } from "./use-hoot-command";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.resolvedTheme = "dark"; });

describe("Hoot command execution", () => {
  it("only changes the existing theme provider on submission", () => {
    const run = useHootCommand();
    expect(mocks.setTheme).not.toHaveBeenCalled();
    expect(run("turn on light mode")).toBe(true);
    expect(mocks.setTheme).toHaveBeenCalledWith("light");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("toggles from the resolved device theme", () => {
    useHootCommand()("toggle theme");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("light");
    mocks.resolvedTheme = "light";
    useHootCommand()("toggle theme");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
  });
  it("navigates using the scoped sidebar href", () => {
    vi.stubGlobal("document", { querySelectorAll: () => [{ dataset: { hootDestination: "Portfolio" }, getAttribute: () => "/t/technology" }] });
    expect(useHootCommand()("take me to holdings")).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("/t/technology");
  });
  it("opens a view of a page, like today's performance", () => {
    vi.stubGlobal("document", { querySelectorAll: () => [{ dataset: { hootDestination: "Performance" }, getAttribute: () => "/t/fund/performance" }] });
    expect(useHootCommand()("go to daily performance")).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("/t/fund/performance?period=today");
  });
  it("switches to the available sector using the existing scope href", () => {
    vi.stubGlobal("document", { querySelectorAll: (selector: string) => selector === "[data-hoot-scope]"
      ? [{ dataset: { hootScope: "Financials", hootHref: "/t/financials/earnings" } }] : [] });
    expect(useHootCommand()("switch me to financials sector")).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("/t/financials/earnings");
  });
  it("hands a sector it can't see on screen to Hoot instead of inventing a route", () => {
    vi.stubGlobal("document", { querySelectorAll: () => [] });
    expect(useHootCommand()("bring me to technology sector")).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("hands a page it can't see on screen to Hoot, which says why it isn't available", () => {
    vi.stubGlobal("document", { querySelectorAll: () => [] });
    expect(useHootCommand()("open admin")).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("returns research questions to the caller with no UI effects", () => {
    expect(useHootCommand()("Show me earnings growth for AAPL")).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.setTheme).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

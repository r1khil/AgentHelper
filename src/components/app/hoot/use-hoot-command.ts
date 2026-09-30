"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { commandHref, parseHootCommand, scopeHref } from "@/lib/hoot/commands";
import type { HootAction } from "@/lib/hoot/app-actions";
import { markScopeIntent } from "@/components/app/shell/scope-intent";
import { answerPanelState, openAnswerPanel } from "./answer-panel-store";
import { takeOver } from "./takeover";
import type { UIMessage } from "ai";

/**
 * Apply what Hoot did in a live answer (its navigate or set_theme tools): drive the screen to the page (page-agent,
 * see takeover.ts), or change the theme. The server already checked the page is one this member can open; this only
 * runs for actions that stream in live. Opening a page leaves the chat that asked (a full thread, or the answer panel,
 * which closes on a new page) while Hoot is still answering, so the conversation comes along in the answer panel on the
 * new page.
 */
export function useApplyHootAction() {
  const router = useRouter();
  const { setTheme } = useTheme();
  return useCallback(
    (action: HootAction, chat?: { chatId: string; messages: UIMessage[] }) => {
      if (action.kind === "theme") {
        setTheme(action.theme);
        toast.success(action.theme === "system" ? "Hoot: Following your device's theme." : `Hoot: ${action.theme === "light" ? "Light" : "Dark"} mode is on.`);
        return;
      }
      // Asked for, so a scope change needs no "Switched to" notice.
      if (action.href.startsWith("/t/")) markScopeIntent();
      // Where the question was asked, before the takeover moves off it.
      const panel = answerPanelState();
      const askedAt = `${window.location.pathname}${window.location.search}`;
      // Hoot drives the screen there (page-agent), and opens it directly if that doesn't make it.
      void takeOver(action).then((arrived) => {
        if (!arrived) {
          if (action.href.startsWith("/t/")) markScopeIntent();
          router.push(action.href);
          toast.success(`Hoot: Opening ${action.label}.`);
        }
        if (!chat) return;
        // Opened once the member is there: the pages clicked through on the way would close it.
        openAnswerPanel({
          chatId: chat.chatId,
          // "Open as a full thread": the panel's own link, or the thread page this was asked on.
          href: panel?.chatId === chat.chatId ? panel.href : askedAt,
          context: action.label,
          messages: chat.messages,
          running: true,
          at: action.href.split(/[?#]/)[0],
        });
      });
    },
    [router, setTheme],
  );
}

/**
 * The instant path for a plain "go to …" or "dark mode": done at once when the page or sector is on screen. Returns
 * false otherwise, so the request goes to Hoot, whose navigate tool resolves nicknames and typos and says why a page
 * isn't available. Run only on a fresh submission, never by replaying saved chat messages.
 */
export function useHootCommand() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  return useCallback((text: string): boolean => {
    const command = parseHootCommand(text);
    if (!command) return false;
    if (command.kind === "theme") {
      const theme = command.theme === "toggle" ? (resolvedTheme === "dark" ? "light" : "dark") : command.theme;
      setTheme(theme);
      toast.success(theme === "system" ? "Hoot: Following your device's theme." : `Hoot: ${theme === "light" ? "Light" : "Dark"} mode is on.`);
    } else if (command.kind === "scope") {
      const links = Array.from(document.querySelectorAll<HTMLElement>("[data-hoot-scope]"), (item) => ({
        label: item.dataset.hootScope ?? "", href: item.dataset.hootHref ?? "",
      }));
      const href = scopeHref(command.scope, links);
      // No exact match on screen: let Hoot resolve it (nicknames, typos) or say why it isn't available.
      if (!href) return false;
      markScopeIntent();
      router.push(href);
      toast.success(`Hoot: Viewing ${links.find((link) => link.href === href)?.label ?? command.scope}.`);
    } else {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-hoot-destination]"), (link) => ({
        label: link.dataset.hootDestination ?? "", href: link.getAttribute("href") ?? "",
      }));
      const href = commandHref(command.destination, links);
      if (!href) return false;
      router.push(`${href}${command.query ?? ""}`);
      toast.success(`Hoot: Opening ${command.query === "?period=today" ? "Performance today" : command.destination}.`);
    }
    return true;
  }, [resolvedTheme, setTheme, router]);
}

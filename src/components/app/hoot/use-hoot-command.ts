"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { commandHref, parseHootCommand, scopeHref } from "@/lib/hoot/commands";
import type { HootAction } from "@/lib/hoot/app-actions";
import { markScopeIntent } from "@/components/app/shell/scope-intent";

/**
 * Apply what Hoot did in a live answer (its navigate or set_theme tools): open the page, or change the theme. The
 * server already checked the page is one this member can open; this only runs for actions that stream in live.
 */
export function useApplyHootAction() {
  const router = useRouter();
  const { setTheme } = useTheme();
  return useCallback(
    (action: HootAction) => {
      if (action.kind === "theme") {
        setTheme(action.theme);
        toast.success(action.theme === "system" ? "Hoot: Following your device's theme." : `Hoot: ${action.theme === "light" ? "Light" : "Dark"} mode is on.`);
        return;
      }
      // Asked for, so a scope change needs no "Switched to" notice.
      if (action.href.startsWith("/t/")) markScopeIntent();
      router.push(action.href);
      toast.success(`Hoot: Opening ${action.label}.`);
    },
    [router, setTheme],
  );
}

/** Run only on a fresh submission, never by replaying saved chat messages. */
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
      if (href) {
        markScopeIntent();
        router.push(href);
        toast.success(`Hoot: Viewing ${links.find((link) => link.href === href)?.label ?? command.scope}.`);
      } else {
        toast.error(`Hoot: ${command.scope} isn't an available sector for your account.`);
      }
    } else {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-hoot-destination]"), (link) => ({
        label: link.dataset.hootDestination ?? "", href: link.getAttribute("href") ?? "",
      }));
      const href = commandHref(command.destination, links);
      if (href) {
        router.push(href);
        toast.success(`Hoot: Opening ${command.destination}.`);
      } else {
        toast.error(`Hoot: ${command.destination} isn't available in your current scope. Choose an available page in the sidebar.`);
      }
    }
    return true;
  }, [resolvedTheme, setTheme, router]);
}

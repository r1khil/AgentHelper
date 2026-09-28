"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { commandHref, parseHootCommand, scopeHref } from "@/lib/hoot/commands";
import { markScopeIntent } from "@/components/app/shell/scope-intent";

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

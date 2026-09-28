"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { pathScope, SCOPE_COOKIE, scopedHref } from "@/lib/scope";
import { markScopeIntent, takeScopeIntent } from "./scope-intent";

type ScopeTeam = { id: string; slug: string; name: string };

/** The scope the chrome is showing (the fund's or a team's slug), for links built on the client. */
const ScopeContext = createContext<string | null>(null);

export const ScopeProvider = ScopeContext.Provider;

/** The slug of the scope in view, or null outside the app shell. */
export function useScopeSlug() {
  return useContext(ScopeContext);
}

/** A link to a team's item that opens in the scope in view when it can (see scopedHref). */
export function ScopedLink({ owner, path, ...props }: Omit<React.ComponentProps<typeof Link>, "href"> & { owner: string; path: string }) {
  const scope = useScopeSlug();
  return <Link {...props} href={scopedHref(scope, owner, path)} />;
}

/* ------------------------------------------------------------------------------------------ Remembering */

const YEAR = 60 * 60 * 24 * 365;

function writeScopeCookie(slug: string) {
  document.cookie = `${SCOPE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${YEAR}; samesite=lax`;
}

/**
 * The scope this tab was last in, kept across pages outside /t/ (Today, a Hoot chat) so they don't change it.
 * Mirrored to a cookie so the server can build links in it and a reload keeps it; a tab that regains focus writes
 * its own scope back, so two tabs in different scopes don't borrow each other's.
 */
export function useRememberedScope(pathname: string, initial: string | null, teams: readonly ScopeTeam[], fundWide: boolean) {
  const [remembered, setRemembered] = useState(initial);
  const own = pathScope(pathname, teams, fundWide);
  if (own && own !== remembered) setRemembered(own);
  const slug = own ?? remembered;

  useEffect(() => {
    if (!slug) return;
    writeScopeCookie(slug);
    const onFocus = () => document.visibilityState === "visible" && writeScopeCookie(slug);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [slug]);

  return remembered;
}

/* ------------------------------------------------------------------------------------------ Switch notice */

/**
 * When following a link changes the scope (a team's item opened from a different team), say so with a small
 * notice and an Undo that goes back to the previous page. Scope changes the member chose get no notice.
 */
export function useScopeSwitchNotice(pathname: string, current: ScopeTeam | "fund" | null) {
  const router = useRouter();
  const last = useRef<{ slug: string | null; url: string } | null>(null);
  const slug = current === "fund" ? FUND_SCOPE_SLUG : (current?.slug ?? null);
  const name = current === "fund" ? "Whole fund" : (current?.name ?? null);

  // Back and Forward return to where the member was; they aren't a surprise.
  useEffect(() => {
    const onPop = () => markScopeIntent();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const before = last.current;
    last.current = { slug, url: `${window.location.pathname}${window.location.search}` };
    const intended = takeScopeIntent();
    if (!before || !slug || !name || before.slug === slug || intended) return;
    const back = before.url;
    toast(`Switched to ${name}`, {
      id: "scope-switch",
      action: {
        label: "Undo",
        onClick: () => {
          markScopeIntent();
          router.push(back);
        },
      },
    });
  }, [pathname, slug, name, router]);
}

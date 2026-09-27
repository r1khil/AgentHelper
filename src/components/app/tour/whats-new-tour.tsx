"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import type { HootMood } from "@/lib/hoot/types";
import { saveTourProgress } from "@/lib/actions/preferences";
import type { TourChapter, TourOffer, TourRecord, TourStep } from "@/lib/tour/types";
import { WHATS_NEW_PITCH, WHATS_NEW_TOUR, WHATS_NEW_TOUR_ID } from "@/lib/tour/whats-new";
import { companionHiddenOn } from "@/lib/hoot/policy";
import { usePrefersReducedMotion } from "@/components/app/hoot/hoot-sprite";
import { whenBootDone } from "@/components/app/boot-signal";
import { FlyingHoot, type FlyingHootHandle, type HootSpot } from "./flying-hoot";
import { gazeToward, padded, placeBeside, placeCenter } from "./placement";
import { rectOf, Spotlight } from "./spotlight";
import { TOUR_CARD_WIDTH, TourCard, type CardView } from "./tour-card";
import { onReplayTour, setTourActive } from "./tour-store";

type Flat = { step: TourStep; chapter: TourChapter; at: number };
const FLAT: Flat[] = WHATS_NEW_TOUR.chapters.flatMap((chapter) => chapter.steps.map((step, at) => ({ step, chapter, at })));
const firstOf = (chapterId: string) => Math.max(0, FLAT.findIndex((f) => f.chapter.id === chapterId));

type Phase =
  | { kind: "off" }
  | { kind: "theme" }
  | { kind: "offer"; later: boolean; chose?: string }
  | { kind: "resume"; index: number }
  | { kind: "step"; index: number }
  | { kind: "wandered"; index: number }
  | { kind: "finish" }
  | { kind: "leaving" };

/** Perched beside the page, and in the middle of the screen for the questions. */
const PERCHED = 64;
const CENTERED = 112;
/** The app is desktop-only; below this the menu is a drawer and there's nothing to fly around. */
const MIN_WIDTH = 900;
/** The menu: the rail (or the classic sidebar on the classic Backtesting layout). */
const MENU = '[data-tour="sidebar"]';
/** The rail's width, where the corner Hoot sits when he's on the left. */
const RAIL = 76;

/** First element matching `selector` that's actually on screen (the mobile menu keeps a hidden copy). */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Scrolls a section to the top of the screen (or a menu item into the menu's view) and waits for it to settle. */
function bringIntoView(el: HTMLElement, reduced: boolean): Promise<void> {
  if (el.closest(MENU)) {
    el.scrollIntoView({ block: "nearest" });
  } else {
    const r = el.getBoundingClientRect();
    const tall = r.height > window.innerHeight * 0.55;
    const fits = r.top >= 16 && r.bottom <= window.innerHeight - 16;
    if (!fits || (tall && r.top > 40)) window.scrollTo({ top: window.scrollY + r.top - 24, behavior: reduced ? "auto" : "smooth" });
  }
  return new Promise((resolve) => {
    let last = el.getBoundingClientRect().top;
    let still = 0;
    const started = performance.now();
    const check = () => {
      const top = el.getBoundingClientRect().top;
      still = Math.abs(top - last) < 0.5 ? still + 1 : 0;
      last = top;
      if (still >= 4 || performance.now() - started > 1200) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/**
 * A Hoot the page itself shows (Today's greeting, Research's intro, an empty state), big enough to take off from and
 * land on. One Hoot per screen: while the tour runs these are hidden (globals.css), so the flying one replaces him.
 */
function pageHootSpot(): HootSpot | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-hoot-sprite]")) {
    if (el.closest("[data-tour-hoot], [data-hoot-companion]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 60 && r.bottom > 0 && r.top < window.innerHeight) return { x: r.left, y: r.top, size: r.width };
  }
  return null;
}

/** Where the corner Hoot sits, so the tour can take off from him and hand back to him. */
function cornerSpot(): HootSpot {
  const trigger = document.querySelector("[data-hoot-companion]");
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    return { x: r.left, y: r.top, size: r.width };
  }
  let left = false;
  try {
    left = localStorage.getItem("hoot:corner") === "left";
  } catch {
    // Storage blocked: he lives on the right.
  }
  return { x: left ? RAIL + 20 : window.innerWidth - 20 - PERCHED, y: window.innerHeight - 20 - PERCHED, size: PERCHED };
}

const sameSpot = (a: HootSpot, b: HootSpot) => Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3 && Math.abs(a.size - b.size) < 1;

/**
 * Hoot's guided tour of the new look, for execs and admins. After the loading screen, he flies to the middle of
 * the screen, asks light or dark, then offers the tour: he perches beside each menu item or tab, waits for a click,
 * and walks through the page's sections while the rest of the app dims. Progress is saved on the profile, so
 * a refresh picks up at the same page; finishing or declining is final until "Replay the tour".
 */
export function WhatsNewTour({ firstName, offer, hootEnabled }: { firstName: string; offer: TourOffer | null; hootEnabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const reduced = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>({ kind: "off" });
  const [start, setStart] = useState<HootSpot | null>(null);
  const [spot, setSpot] = useState<HootSpot | null>(null);
  const [layout, setLayout] = useState<{ card: { x: number; y: number }; gaze?: { x: number; y: number } }>({ card: { x: 0, y: 0 } });
  const [cardSize, setCardSize] = useState({ width: TOUR_CARD_WIDTH, height: 220 });
  /** The page part found for a step (null element: it never showed up and Hoot explains from the middle). */
  const [found, setFound] = useState<{ key: string; el: HTMLElement | null } | null>(null);
  /** Hoot has landed for this card, so it can show. */
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);

  const hoot = useRef<FlyingHootHandle>(null);
  const themed = useRef(offer?.themed ?? false);
  const armed = useRef<number | null>(null);
  const direction = useRef<1 | -1>(1);
  const chapterPaths = useRef<Record<string, string>>({});
  /** Which card the current flight is taking Hoot to, so a flight cut short never shows the wrong card. */
  const flightKey = useRef<string | null>(null);
  const spotNow = useRef<HootSpot | null>(null);
  const running = phase.kind !== "off";
  const runningRef = useRef(running);
  useLayoutEffect(() => {
    runningRef.current = running;
    spotNow.current = spot;
  });

  // What's on screen, derived from the phase and the page.
  const flat = phase.kind === "step" || phase.kind === "resume" ? FLAT[phase.index] : null;
  const step = phase.kind === "step" ? FLAT[phase.index] : null;
  const onPage = !!step && step.chapter.route.test(pathname);
  /** Followed a link away from the page being explained. */
  const wandered = !!step && step.step.kind !== "go" && !onPage;
  const key = wandered ? `wandered-${step.step.id}` : step ? `step-${step.step.id}` : phase.kind === "offer" ? `offer-${phase.chose ?? ""}` : phase.kind;
  const missing = !!step && !wandered && found?.key === key && !found.el;
  const centered = phase.kind === "theme" || phase.kind === "offer" || phase.kind === "resume" || phase.kind === "finish" || wandered || missing;
  const ready = centered || found?.key === key;
  /** Keep lighting the last part until the next one is found, so the window glides instead of blinking. */
  const lit = phase.kind === "step" && !centered ? (found?.el ?? null) : null;

  const save = useCallback((status: TourRecord["status"], chapter?: string) => {
    void saveTourProgress(WHATS_NEW_TOUR_ID, { status, chapter, themed: themed.current || undefined, at: new Date().toISOString() }).catch(() => {
      // Offline: the tour still runs; it may be offered again next time.
    });
  }, []);

  const begin = useCallback((first: Phase) => {
    if (runningRef.current || window.innerWidth < MIN_WIDTH) return;
    runningRef.current = true;
    const from = pageHootSpot() ?? cornerSpot();
    document.documentElement.dataset.touring = "";
    flightKey.current = null;
    setStart(from);
    setSpot(from);
    setFound(null);
    setTourActive(true);
    setPhase(first);
  }, []);

  // Open on the first page after the loading screen, or when asked: ?tour=whats-new (for checking it) or Replay.
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "whats-new";
    if (forced) {
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState(window.history.state, "", url);
    }
    let timer = 0;
    const stop = whenBootDone(() => {
      timer = window.setTimeout(() => {
        if (forced) begin({ kind: "theme" });
        else if (offer?.mode === "resume") begin({ kind: "resume", index: offer.chapter ? firstOf(offer.chapter) : 0 });
        else if (offer) begin(offer.themed ? { kind: "offer", later: offer.mode === "later" } : { kind: "theme" });
      }, 450);
    });
    const unreplay = onReplayTour(() => {
      if (runningRef.current) return;
      save("active", FLAT[0].chapter.id);
      begin({ kind: "step", index: 0 });
    });
    return () => {
      stop();
      unreplay();
      window.clearTimeout(timer);
    };
    // The offer is decided once per full page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = useCallback(
    (index: number, from?: number) => {
      if (index >= FLAT.length) {
        setPhase({ kind: "finish" });
        return;
      }
      if (from === undefined || FLAT[from].chapter.id !== FLAT[index].chapter.id) save("active", FLAT[index].chapter.id);
      setPhase({ kind: "step", index });
    },
    [save],
  );

  const next = useCallback(() => {
    if (phase.kind !== "step") return;
    direction.current = 1;
    goTo(phase.index + 1, phase.index);
  }, [phase, goTo]);
  const canBack = phase.kind === "step" && phase.index > 0 && FLAT[phase.index - 1].chapter.id === FLAT[phase.index].chapter.id && FLAT[phase.index - 1].step.kind === "info";
  const back = useCallback(() => {
    if (phase.kind !== "step" || !canBack) return;
    direction.current = -1;
    setPhase({ kind: "step", index: phase.index - 1 });
  }, [phase, canBack]);
  const skipChapter = useCallback(() => {
    if (phase.kind !== "step") return;
    const here = FLAT[phase.index].chapter.id;
    const after = FLAT.findIndex((f, i) => i > phase.index && f.chapter.id !== here);
    direction.current = 1;
    goTo(after === -1 ? FLAT.length : after, phase.index);
  }, [phase, goTo]);

  /**
   * Back to the page's own Hoot, or his corner (off screen if he's switched off or the page hides him), then hand
   * over to that Hoot.
   */
  const leave = useCallback(
    (status: TourRecord["status"]) => {
      save(status);
      flightKey.current = "leaving";
      setPhase({ kind: "leaving" });
      const home = pageHootSpot() ?? (hootEnabled && !companionHiddenOn(pathname) ? cornerSpot() : null);
      setSpot(home ?? { x: window.innerWidth + 40, y: window.innerHeight - 140, size: PERCHED });
    },
    [save, hootEnabled, pathname],
  );

  // Find the step's part of the page (it may stream in), bring it into view, then let Hoot fly there.
  useEffect(() => {
    if (phase.kind !== "step" || wandered) return;
    const index = phase.index;
    const { step: s, chapter } = FLAT[index];
    const stepKey = `step-${s.id}`;
    if (onPage && s.kind !== "go") chapterPaths.current[chapter.id] = pathname;
    // A go step already clicked: the arrival effect below moves on.
    if (s.kind === "go" && onPage && armed.current === index) return;
    armed.current = s.kind === "go" && !onPage ? index : null;

    let cancelled = false;
    let timer = 0;
    const deadline = performance.now() + (s.waitMs ?? 6000);
    const poll = () => {
      if (cancelled) return;
      const el = s.target ? findVisible(s.target) : null;
      if (el) {
        void bringIntoView(el, reduced).then(() => {
          if (!cancelled) setFound({ key: stepKey, el });
        });
      } else if (s.target && performance.now() < deadline) {
        timer = window.setTimeout(poll, 150);
      } else if (s.ifMissing === "center" || !s.target) {
        setFound({ key: stepKey, el: null });
      } else if (direction.current < 0 && index > 0 && FLAT[index - 1].chapter.id === chapter.id && FLAT[index - 1].step.kind === "info") {
        setPhase({ kind: "step", index: index - 1 });
      } else {
        goTo(index + 1, index);
      }
    };
    timer = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, pathname, onPage, wandered, reduced, goTo]);

  // The member clicked the highlighted menu item and the new page is here.
  useEffect(() => {
    if (phase.kind !== "step" || armed.current !== phase.index || !onPage) return;
    armed.current = null;
    direction.current = 1;
    goTo(phase.index + 1, phase.index);
  }, [phase, onPage, goTo]);

  // A "do this" step moves on once the page shows it was done.
  useEffect(() => {
    const until = step?.step.kind === "wait" ? step.step.until : undefined;
    if (!until || wandered) return;
    const id = window.setInterval(() => {
      if (findVisible(until)) next();
    }, 300);
    return () => window.clearInterval(id);
  }, [step, wandered, next]);

  // Measure the card, since where it fits depends on how much there is to say.
  useEffect(() => {
    if (!cardEl) return;
    const ro = new ResizeObserver(() => setCardSize({ width: cardEl.offsetWidth, height: cardEl.offsetHeight }));
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [cardEl]);

  // Follow the page when it scrolls, the window resizes or the lit part changes size. The spotlight tracks every
  // frame; Hoot and his card move once things settle.
  useEffect(() => {
    if (!running) return;
    let t = 0;
    const settle = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setLayoutTick((n) => n + 1), 160);
    };
    // A part that fills in after it's lit (the risk panel after Run) may now run off the screen: scroll again.
    let grow = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(grow);
      grow = window.setTimeout(() => {
        if (lit) void bringIntoView(lit, reduced).then(settle);
      }, 200);
    });
    if (lit) ro.observe(lit);
    window.addEventListener("scroll", settle, { passive: true, capture: true });
    window.addEventListener("resize", settle);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(grow);
      ro.disconnect();
      window.removeEventListener("scroll", settle, { capture: true });
      window.removeEventListener("resize", settle);
    };
  }, [running, lit, reduced]);

  // Where Hoot perches and the card sits for what's on screen now (measured on the next frame).
  const target = centered ? null : found?.key === key ? found.el : null;
  useEffect(() => {
    if (!running || phase.kind === "leaving" || !ready) return;
    const frame = requestAnimationFrame(() => {
      const view = { width: window.innerWidth, height: window.innerHeight };
      const box = target && target.isConnected ? padded(rectOf(target), 8, view) : null;
      const p = box ? placeBeside(box, PERCHED, cardSize, view) : placeCenter(CENTERED, cardSize, view);
      const nextSpot = { x: p.hoot.x, y: p.hoot.y, size: box ? PERCHED : CENTERED };
      setLayout({ card: p.card, gaze: box ? gazeToward(p.hoot, PERCHED, box) : { x: 0, y: 0.6 } });
      flightKey.current = key;
      if (spotNow.current && sameSpot(spotNow.current, nextSpot)) setLandedKey(key);
      else setSpot(nextSpot);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, phase.kind, ready, key, target, cardSize, layoutTick]);

  const onLanded = useCallback(() => {
    const landedFor = flightKey.current;
    if (landedFor === "leaving") {
      setTourActive(false);
      delete document.documentElement.dataset.touring;
      // Stay a moment while the corner Hoot rises into the same spot, so the hand-off doesn't blink.
      window.setTimeout(() => {
        runningRef.current = false;
        setPhase({ kind: "off" });
        setLandedKey(null);
      }, 450);
      return;
    }
    if (!landedFor) return;
    hoot.current?.hop();
    setLandedKey(landedFor);
  }, []);

  // Keys: Esc ends (or postpones at the offer), arrows step through.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase.kind === "theme" || phase.kind === "offer") leave("later");
        else if (phase.kind !== "leaving") leave("done");
      } else if (!typing && step?.step.kind === "info" && !wandered && e.key === "ArrowRight") next();
      else if (!typing && e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, phase.kind, step, wandered, next, back, leave]);

  const chooseTheme = useCallback(
    (value: "light" | "dark" | "system") => {
      setTheme(value);
      themed.current = true;
      setPhase({ kind: "offer", later: offer?.mode === "later", chose: value });
    },
    [setTheme, offer],
  );
  /** Every button on Hoot's card lands here. */
  const act = useCallback(
    (id: string, arg?: string) => {
      switch (id) {
        case "light":
        case "dark":
        case "system":
          return chooseTheme(id);
        case "start":
          direction.current = 1;
          return goTo(0);
        case "resume":
          return phase.kind === "resume" ? goTo(phase.index) : undefined;
        case "later":
          return leave("later");
        case "end":
          return leave("done");
        case "next":
          return next();
        case "back":
          return back();
        case "skip-page":
          return skipChapter();
        case "go":
          return found?.el?.click();
        case "return": {
          if (!step) return;
          const goStep = step.chapter.steps.find((s) => s.kind === "go");
          const href = chapterPaths.current[step.chapter.id] ?? (goStep?.target ? findVisible(goStep.target)?.getAttribute("href") : null) ?? "/";
          return router.push(href);
        }
        case "example":
          return void window.dispatchEvent(new CustomEvent("hoot:fill-ask", { detail: arg }));
      }
    },
    [phase, step, found, chooseTheme, goTo, leave, next, back, skipChapter, router],
  );
  const shrug = useCallback(() => hoot.current?.shrug(), []);

  const view: CardView | null = useMemo(() => {
    if (wandered && step) {
      return {
        key,
        title: "We wandered off the tour",
        body: `No problem. Want to go back to ${step.chapter.label} and carry on?`,
        actions: [{ id: "return", label: "Back to the tour" }],
        links: [{ id: "end", label: "End tour" }],
      };
    }
    switch (phase.kind) {
      case "theme":
        return {
          key,
          title: `Hi ${firstName}! First question:`,
          body: "Do you like The Owl's Nest light or dark?",
          actions: [
            { id: "light", label: "Light", icon: <Sun />, variant: "outline" },
            { id: "dark", label: "Dark", icon: <Moon />, variant: "outline" },
          ],
          links: [{ id: "system", label: "Match my computer" }],
        };
      case "offer":
        return {
          key,
          title: phase.later ? WHATS_NEW_PITCH.again : WHATS_NEW_PITCH.title,
          body: WHATS_NEW_PITCH.body,
          actions: [
            { id: "later", label: "Later", variant: "outline" },
            { id: "start", label: "Show me around" },
          ],
          links: [{ id: "end", label: "No thanks" }],
          footnote: phase.chose
            ? `${phase.chose === "system" ? "Matching your computer" : phase.chose === "dark" ? "Dark it is" : "Light it is"}. You can change it any time: click your initials at the bottom of the menu.`
            : "You can replay the tour any time: click your initials at the bottom of the menu.",
        };
      case "resume":
        return {
          key,
          title: `Welcome back, ${firstName}!`,
          body: `Want to pick up the tour where we left off, at ${flat?.chapter.label ?? "the start"}?`,
          actions: [
            { id: "start", label: "Start over", variant: "outline" },
            { id: "resume", label: "Keep going" },
          ],
          links: [{ id: "end", label: "End tour" }],
        };
      case "finish":
        return {
          key,
          title: "That's the new look!",
          body: hootEnabled
            ? "Press ⌘K any time to jump somewhere or ask me something. On most pages I'm in the corner too: click me, or press ⌘J."
            : "Press ⌘K any time to jump somewhere or ask me something. Turn on Floating Hoot under your initials if you'd like me in the corner of every page too.",
          actions: [{ id: "end", label: "Thanks, Hoot" }],
        };
      case "step": {
        const { step: s, chapter, at } = FLAT[phase.index];
        const lastStep = phase.index === FLAT.length - 1;
        const moreInChapter = at < chapter.steps.length - 1;
        const links = [
          ...(canBack ? [{ id: "back", label: "Back" }] : []),
          ...(moreInChapter && chapter.id !== "menu" ? [{ id: "skip-page", label: "Skip this page" }] : []),
          { id: "end", label: "End tour" },
        ];
        const eyebrow = `${chapter.label} · ${at + 1} of ${chapter.steps.length}`;
        if (missing) return { key, eyebrow, title: s.title, body: s.missing, actions: [{ id: "next", label: "Next" }], links };
        if (s.kind === "go" && !onPage) {
          return { key, eyebrow, title: s.title, body: s.body, prompt: s.prompt, actions: [{ id: "go", label: "Take me there", variant: "outline" }], links };
        }
        if (s.kind === "wait") {
          return { key, eyebrow, title: s.title, body: s.body, prompt: s.prompt, actions: [{ id: "next", label: "Skip", variant: "outline" }], links };
        }
        return {
          key,
          eyebrow,
          title: s.title,
          body: s.body,
          points: s.points,
          what: s.what,
          how: s.how,
          source: s.source,
          examples: s.examples,
          actions: [{ id: "next", label: lastStep ? "Finish" : "Next" }],
          links,
        };
      }
      default:
        return null;
    }
  }, [phase, key, wandered, step, flat, missing, onPage, firstName, hootEnabled, canBack]);

  if (!running || !start || !spot) return null;

  const landed = landedKey === key && ready;
  const mood: HootMood = !landed
    ? phase.kind === "leaving"
      ? "happy"
      : "alert"
    : phase.kind === "theme" || phase.kind === "resume"
      ? "wave"
      : (phase.kind === "offer" && phase.chose) || phase.kind === "finish"
        ? "happy"
        : wandered || missing
          ? "concerned"
          : step?.step.kind === "wait"
            ? "thinking"
            : (step?.step.mood ?? "idle");
  const inMenu = !!lit?.closest(MENU);
  const isMenu = !!lit?.matches(MENU);

  return (
    <>
      <Spotlight target={phase.kind === "leaving" ? null : lit} visible={phase.kind !== "leaving"} pad={isMenu ? 0 : inMenu ? 4 : 10} radius={isMenu ? 4 : inMenu ? 10 : 14} reduced={reduced} onBlockedClick={shrug} />
      <FlyingHoot ref={hoot} from={start} to={spot} mood={mood} gaze={landed ? layout.gaze : undefined} reduced={reduced} visible onLanded={onLanded} />
      {view && <TourCard ref={setCardEl} view={view} onAction={act} x={layout.card.x} y={layout.card.y} visible={landed && phase.kind !== "leaving"} glide={landed} />}
    </>
  );
}


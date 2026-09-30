"use client";

// Where Hoot is paying attention, shared by every Hoot on the page (one set of listeners, however many owls).
// In order: the text field you're typing in (he follows the caret; an empty box nobody has typed in lately, like
// Home's autofocused ask box, doesn't hold his gaze), where you just clicked, which way you're
// scrolling, your pointer, and when nothing is happening, an occasional look around. It only ever moves his eyes
// and posture; nothing here makes him speak or move across the page.

export type HootTarget =
  | { kind: "point"; x: number; y: number }
  /** A direction in his own frame, -1..1 on each axis. */
  | { kind: "dir"; x: number; y: number }
  | { kind: "rest" };

export type Attention = { target: HootTarget; /** A password field has focus: he looks away. */ secret: boolean };

const REST: Attention = { target: { kind: "rest" }, secret: false };
const POINTER_MS = 5000;
const CLICK_MS = 900;
const SCROLL_MS = 700;
const TYPING_MS = 2500;

let state: Attention = REST;
const listeners = new Set<(a: Attention) => void>();
let stop: (() => void) | null = null;

function textField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && ["text", "search", "email", "password", "url", "tel", "number", ""].includes(el.type);
}

function same(a: Attention, b: Attention) {
  if (a.secret !== b.secret || a.target.kind !== b.target.kind) return false;
  if (a.target.kind === "rest" || b.target.kind === "rest") return true;
  const tol = a.target.kind === "point" ? 3 : 0.04;
  return Math.abs(a.target.x - b.target.x) < tol && Math.abs(a.target.y - (b.target as { y: number }).y) < tol;
}

function start() {
  const pointer = { x: 0, y: 0, at: -Infinity };
  const click = { x: 0, y: 0, at: -Infinity };
  const scroll = { dir: 0, at: -Infinity };
  let typedAt = -Infinity;
  let wander = { x: 0, y: 0, until: 0, next: performance.now() + 4000 };
  const scrollTops = new WeakMap<EventTarget, number>();
  let frame = 0;

  const compute = () => {
    frame = 0;
    const now = performance.now();
    const el = document.activeElement;
    let next: Attention;
    const field = textField(el) ? el : null;
    const len = !field ? 0 : "value" in field ? String((field as HTMLInputElement).value).length : (field.textContent?.length ?? 0);
    const secret = field instanceof HTMLInputElement && field.type === "password";
    if (field && (secret || len > 0 || now - typedAt < TYPING_MS)) {
      // Roughly where the caret is: he reads along as you type.
      const r = field.getBoundingClientRect();
      next = { target: { kind: "point", x: r.left + Math.min(r.width - 6, 12 + len * 7), y: r.top + Math.min(r.height / 2, 16) }, secret };
    } else if (now - click.at < CLICK_MS) {
      next = { target: { kind: "point", x: click.x, y: click.y }, secret: false };
    } else if (now - scroll.at < SCROLL_MS) {
      next = { target: { kind: "dir", x: 0, y: scroll.dir * 0.8 }, secret: false };
    } else if (now - pointer.at < POINTER_MS) {
      next = { target: { kind: "point", x: pointer.x, y: pointer.y }, secret: false };
    } else {
      if (now > wander.next) {
        const look = Math.random() > 0.35;
        wander = {
          x: look ? (Math.random() - 0.5) * 1.6 : 0,
          y: look ? (Math.random() - 0.65) * 0.9 : 0,
          until: now + 900 + Math.random() * 1100,
          next: now + 3500 + Math.random() * 6000,
        };
      }
      next = now < wander.until ? { target: { kind: "dir", x: wander.x, y: wander.y }, secret: false } : REST;
    }
    if (!same(next, state)) {
      state = next;
      for (const l of listeners) l(state);
    }
  };
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(compute);
  };

  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
    soon();
  };
  const onDown = (e: PointerEvent) => {
    click.x = e.clientX;
    click.y = e.clientY;
    click.at = performance.now();
    soon();
  };
  const onInput = () => {
    typedAt = performance.now();
    soon();
  };
  // Capture phase so scrolling inside a panel (the research board, a table) counts too.
  const onScroll = (e: Event) => {
    const t = e.target === document ? document.scrollingElement : (e.target as Element | null);
    if (!t) return;
    const top = t.scrollTop;
    const prev = scrollTops.get(t) ?? top;
    scrollTops.set(t, top);
    if (top === prev) return;
    scroll.dir = top > prev ? 1 : -1;
    scroll.at = performance.now();
    soon();
  };

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true, capture: true });
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  document.addEventListener("focusin", soon);
  document.addEventListener("focusout", soon);
  document.addEventListener("input", onInput, true);
  // Timed sources (a click glance wearing off, the next look around) need a slow tick. Paused while hidden.
  let tick = window.setInterval(compute, 250);
  const onVisibility = () => {
    window.clearInterval(tick);
    if (document.visibilityState === "visible") tick = window.setInterval(compute, 250);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    cancelAnimationFrame(frame);
    window.clearInterval(tick);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("pointerdown", onDown, { capture: true });
    document.removeEventListener("scroll", onScroll, { capture: true });
    document.removeEventListener("focusin", soon);
    document.removeEventListener("focusout", soon);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("visibilitychange", onVisibility);
    state = REST;
  };
}

/** Called with every change, and once straight away (asynchronously). Returns an unsubscribe. */
export function watchAttention(listener: (a: Attention) => void) {
  listeners.add(listener);
  if (!stop) stop = start();
  queueMicrotask(() => listeners.has(listener) && listener(state));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

/** Turn an attention target into a gaze (-1..1) for an owl whose box is `rect`. Nearer targets need less eye travel. */
export function gazeFor(a: Attention, rect: DOMRect | null, reachPx = 260): { x: number; y: number } {
  if (a.secret) return { x: -0.7, y: 0.45 };
  const t = a.target;
  if (t.kind === "rest" || !rect) return { x: 0, y: 0 };
  if (t.kind === "dir") return { x: t.x, y: t.y };
  const dx = t.x - (rect.left + rect.width / 2);
  const dy = t.y - (rect.top + rect.height * 0.48);
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(dist / reachPx, 1);
  return { x: (dx / dist) * reach, y: (dy / dist) * reach };
}

"use client";

import { useEffect } from "react";

/**
 * Opens the `<details>` a `#hash` points at (and every `<details>` around it), then scrolls to it, so a link from a
 * summary panel lands on the expanded detail below the fold.
 */
export function OpenDetailsOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      let node: HTMLElement | null = el;
      let opened = false;
      while (node) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          node.open = true;
          opened = true;
        }
        node = node.parentElement;
      }
      if (opened) el.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

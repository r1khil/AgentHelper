// ESLint rule owl/type-scale: font sizes come from the type scale in src/app/globals.css (text-caption, text-body,
// text-emph, text-title, text-display, text-hero). It flags arbitrary sizes like text-[12.5px] and Tailwind's named
// sizes (text-xs, text-sm, …) in any string or template literal, and says which step the codemod would pick.
// `npm run codemod:type-scale` rewrites them all; the patterns and mapping are shared with that codemod.

import { SIZE_RE, UNMAPPED_RE, NAMED, mapPx } from "../codemods/type-scale.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Font sizes must come from the type scale (text-caption … text-hero)" },
    schema: [],
    messages: {
      offScale: "`{{found}}` is off the type scale; use `{{fix}}`. `npm run codemod:type-scale` rewrites these.",
      unmapped: "`{{found}}` is off the type scale; use one of text-caption, text-body, text-emph, text-title, text-display, text-hero.",
    },
  },
  create(context) {
    function check(node, value) {
      if (!value.includes("text-")) return;
      for (const m of value.matchAll(new RegExp(SIZE_RE.source, "g"))) {
        const px = m[1] !== undefined ? Number(m[1]) : NAMED[m[2]];
        context.report({ node, messageId: "offScale", data: { found: m[0], fix: `text-${mapPx(px, value)}` } });
      }
      for (const m of value.matchAll(new RegExp(UNMAPPED_RE.source, "g"))) {
        context.report({ node, messageId: "unmapped", data: { found: m[0] } });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default rule;

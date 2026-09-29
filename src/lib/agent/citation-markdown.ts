import { CITATION_RE } from "./citations";

type Node = { type: string; value?: string; url?: string; children?: Node[]; data?: { hName: string; hProperties: Record<string, string> } };
const EMPTY_CITATION = /\s*\[src:\s*\]/g;
const citation = (id: string): Node => ({ type: "link", url: "", children: [{ type: "text", value: "" }], data: { hName: "cite", hProperties: { "data-source-id": id } } });

/** Parse citations as structured nodes, BEFORE URL sanitization. No custom URL scheme is needed. */
export function remarkCitations() {
  return (tree: Node) => {
    function visit(parent: Node) {
      if (!parent.children || ["code", "inlineCode"].includes(parent.type)) return;
      parent.children = parent.children.flatMap((node) => {
        if (node.type === "link") {
          const legacy = node.url?.match(/^src:([\w-]+)$/);
          return legacy ? [citation(legacy[1])] : [node];
        }
        if (node.type !== "text") {
          visit(node);
          return [node];
        }
        // An empty marker ("[src: ]", written when a lookup returned no id) has nothing to open: drop it.
        const text = (node.value ?? "").replace(EMPTY_CITATION, "");
        if (text !== node.value) node = { ...node, value: text };
        const parts: Node[] = [];
        let start = 0;
        for (const match of text.matchAll(new RegExp(CITATION_RE))) {
          if (match.index > start) parts.push({ type: "text", value: text.slice(start, match.index) });
          for (const id of match[1].split(/\s*,\s*(?:src:\s*)?/)) parts.push(citation(id));
          start = match.index + match[0].length;
        }
        if (!start) return [node];
        if (start < text.length) parts.push({ type: "text", value: text.slice(start) });
        return parts;
      });
    }
    visit(tree);
  };
}

/** Figures as Hoot writes them: 1.04%, (11 bp), +8.8 bp, $4,463,709.80, 13.3x, 2.1 pp, and "-" or "n/a" for a gap. */
const FIGURE = /^[(+\-–]?\$?\d[\d,]*(\.\d+)?\s?(%|bp|pp|x|[kmb])?\)?$/i;
const GAP = /^(-|–|—|n\/a|na)?$/i;

const textOf = (n: Node): string => (n.type === "link" && n.data?.hName === "cite" ? "" : (n.value ?? (n.children ?? []).map(textOf).join("")));

/** Whether a table cell's words are a figure (or an empty one), for right-aligning a column of numbers. */
export const isFigureCell = (text: string) => FIGURE.test(text.trim());

/**
 * Right-align the table columns whose body cells are all figures, unless the answer aligned them itself. Runs after
 * `remarkCitations`, whose citation nodes it ignores, so a "(6.4) [src:x]" cell still reads as a number.
 */
export function remarkNumericColumns() {
  return (tree: Node & { align?: (string | null)[] }) => {
    const walk = (node: Node & { align?: (string | null)[] }) => {
      if (node.type === "table" && node.children && node.children.length > 1) {
        const [, ...body] = node.children;
        const cols = Math.max(...node.children.map((r) => r.children?.length ?? 0));
        const align = [...(node.align ?? [])];
        for (let c = 0; c < cols; c++) {
          if (align[c]) continue;
          const cells = body.map((r) => textOf(r.children?.[c] ?? { type: "text", value: "" }).trim());
          if (cells.some((t) => FIGURE.test(t)) && cells.every((t) => FIGURE.test(t) || GAP.test(t))) align[c] = "right";
        }
        node.align = align.length ? align : node.align;
      }
      node.children?.forEach((child) => walk(child as Node));
    };
    walk(tree);
  };
}

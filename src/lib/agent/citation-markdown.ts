import { CITATION_RE } from "./citations";

type Node = { type: string; value?: string; url?: string; children?: Node[]; data?: { hName: string; hProperties: Record<string, string> } };
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
        const text = node.value ?? "";
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

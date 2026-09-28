// Types for type-scale.mjs, so TypeScript tests can import it.
export type ScaleName = "caption" | "body" | "emph" | "title" | "display" | "hero";
export declare const SCALE: Record<ScaleName, { px: number; leading: number }>;
export declare const SCALE_NAMES: ScaleName[];
export declare const NAMED: Record<string, number>;
export declare const COMPACT: RegExp;
export declare const SUBLINE: RegExp;
export declare const TALL: RegExp;
export declare const SIZE_RE: RegExp;
export declare const UNMAPPED_RE: RegExp;
export declare function mapPx(px: number, context?: string): ScaleName;
export declare function transform(text: string, file?: string): { text: string; changes: { from: string; to: string; line: number }[] };
export declare function unmapped(text: string): { match: string; line: number }[];

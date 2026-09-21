import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { embeddingDims } from "./retrieval-models";

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * `column::halfvec(dims) <=> vector::halfvec(dims)`. The cast matches the per-model partial HNSW index expression,
 * and callers pair it with `modelLiteral` so the planner can prove the index's WHERE clause.
 */
export function cosineDistance(column: SQLWrapper, vector: number[], model: string): SQL<number> {
  const dims = sql.raw(String(embeddingDims(model)));
  return sql<number>`(${column}::extensions.halfvec(${dims}) <=> ${JSON.stringify(vector)}::extensions.halfvec(${dims}))`;
}

/** The model id inlined as a SQL literal (not a bind parameter) so partial indexes stay usable. */
export function modelLiteral(model: string): SQL {
  return sql.raw(quote(model));
}

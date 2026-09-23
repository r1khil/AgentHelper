import { expect, it } from "vitest";
import { previewSnapshot } from "./preview";
import { addedPositionId, withAddedCompanies } from "./scenario";

it("adds recognized companies only to the modified scenario while preserving saved weights and cash", () => {
  const next = withAddedCompanies(previewSnapshot, [
    { ticker: "gamma", name: "Former holding" },
  ]);
  expect(previewSnapshot.positions.map((p) => p.ticker)).toEqual(["ALPHA", "BETA", "CASH"]);
  expect(next.positions.map((p) => p.ticker)).toEqual(["ALPHA", "BETA", "GAMMA", "CASH"]);
  expect(next.positions[2]).toMatchObject({
    id: addedPositionId("GAMMA"),
    weight: 0,
    kind: "scenario",
    name: "Former holding",
  });
  expect(next.positions.at(-1)?.weight).toBeCloseTo(0.1);
  expect(next.savedWeightTotal).toBe(previewSnapshot.savedWeightTotal);
  expect(() => withAddedCompanies(previewSnapshot, [{ ticker: "ALPHA", name: "Duplicate" }]))
    .toThrow(/already/);
});

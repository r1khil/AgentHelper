import { intervalChange } from "./interval";
import type { PerformancePoint } from "./series";

export type Selection = {
  active: number | null;
  anchor: number | null;
  dragging: boolean;
};
export type SelectionAction =
  | { type: "start" | "move" | "end" | "hover"; index: number }
  | { type: "key"; index: number; extend: boolean; fallback: number }
  | { type: "clear" | "leave" | "lost" };
export const emptySelection: Selection = {
  active: null,
  anchor: null,
  dragging: false,
};

export function selectionReducer(
  state: Selection,
  action: SelectionAction,
): Selection {
  switch (action.type) {
    case "start":
      return { active: action.index, anchor: action.index, dragging: true };
    case "move":
      return state.dragging && state.active !== action.index
        ? { ...state, active: action.index }
        : state;
    case "end":
      return state.dragging
        ? {
            active: action.index,
            anchor: action.index === state.anchor ? null : state.anchor,
            dragging: false,
          }
        : state;
    case "hover":
      return state.anchor === null &&
        !state.dragging &&
        state.active !== action.index
        ? { ...state, active: action.index }
        : state;
    case "key":
      return {
        active: action.index,
        anchor: action.extend
          ? (state.anchor ?? state.active ?? action.fallback)
          : null,
        dragging: false,
      };
    case "leave":
      return state.anchor === null && !state.dragging ? emptySelection : state;
    case "lost":
      return state.dragging ? emptySelection : state;
    case "clear":
      return emptySelection;
  }
}

/** Selection measures the earlier close to the later close, in either drag direction. */
export function selectionBounds(selection: Selection): [number, number] | null {
  const { anchor, active } = selection;
  return anchor === null || active === null || anchor === active
    ? null
    : [Math.min(anchor, active), Math.max(anchor, active)];
}

export function intervalPerformance(
  start: PerformancePoint,
  end: PerformancePoint,
  key: string,
) {
  return intervalChange(start.values[key], end.values[key], "price");
}

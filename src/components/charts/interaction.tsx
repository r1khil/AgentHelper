"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  DefaultZIndexes,
  ZIndexLayer,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import {
  emptySelection,
  selectionBounds,
  selectionReducer,
  type Selection,
  type SelectionAction,
} from "@/lib/charts/selection";
import { nearestCoordinate } from "@/lib/charts/interval";
import { ChartTooltip } from "./primitives";

/**
 * Selection over `count` observations, reset when `resetKey` (a primitive such as the first observation's date) changes.
 * Keyed by value rather than array identity, so a caller that rebuilds its rows on every render keeps the selection.
 */
export function useChartSelection(resetKey: unknown, count: number) {
  const [state, send] = useReducer(
    (
      state: { key: unknown; selection: Selection },
      action: { key: unknown; action: SelectionAction },
    ) => {
      const same = Object.is(state.key, action.key);
      const selection = selectionReducer(
        same ? state.selection : emptySelection,
        action.action,
      );
      // Returning the same state lets React skip the re-render when the nearest observation has not changed.
      return same && selection === state.selection
        ? state
        : { key: action.key, selection };
    },
    { key: resetKey, selection: emptySelection },
  );
  if (!Object.is(state.key, resetKey))
    send({ key: resetKey, action: { type: "clear" } });
  const dispatch = useCallback(
    (action: SelectionAction) => send({ key: resetKey, action }),
    [resetKey],
  );
  const current = Object.is(state.key, resetKey)
    ? state.selection
    : emptySelection;
  // Fewer observations under the same key (a shorter reload) cannot keep indices past the end.
  const selection =
    (current.active ?? 0) < count && (current.anchor ?? 0) < count
      ? current
      : emptySelection;
  return { selection, dispatch, bounds: selectionBounds(selection) };
}

/** The same captured-pointer and keyboard behavior for custom SVG and Recharts plots. */
export function useScrubBindings(
  count: number,
  selection: Selection,
  dispatch: Dispatch<SelectionAction>,
  indexAt: (event: PointerEvent<SVGRectElement>) => number | null,
) {
  const pointer = useRef<{ id: number; target: SVGRectElement } | null>(null);
  const release = useCallback(() => {
    const held = pointer.current;
    pointer.current = null;
    if (held?.target.hasPointerCapture(held.id))
      held.target.releasePointerCapture(held.id);
  }, []);
  useEffect(() => release, [dispatch, release]);
  return {
    onPointerDown: (event: PointerEvent<SVGRectElement>) => {
      if (!event.isPrimary || event.button !== 0 || pointer.current !== null)
        return;
      const index = indexAt(event);
      if (index === null) return;
      event.currentTarget.focus({ preventScroll: true });
      pointer.current = { id: event.pointerId, target: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch({ type: "start", index });
    },
    onPointerMove: (event: PointerEvent<SVGRectElement>) => {
      if (
        !event.isPrimary ||
        (pointer.current && pointer.current.id !== event.pointerId)
      )
        return;
      const index = indexAt(event);
      if (index !== null)
        dispatch({
          type: pointer.current?.id === event.pointerId ? "move" : "hover",
          index,
        });
    },
    onPointerUp: (event: PointerEvent<SVGRectElement>) => {
      if (pointer.current?.id !== event.pointerId) return;
      const index = indexAt(event);
      dispatch(index === null ? { type: "clear" } : { type: "end", index });
      release();
    },
    onPointerLeave: () => dispatch({ type: "leave" }),
    onPointerCancel: (event: PointerEvent<SVGRectElement>) => {
      if (pointer.current?.id !== event.pointerId) return;
      release();
      dispatch({ type: "clear" });
    },
    onLostPointerCapture: () => {
      pointer.current = null;
      dispatch({ type: "lost" });
    },
    onBlur: () => {
      release();
      dispatch({ type: "lost" });
      dispatch({ type: "leave" });
    },
    onFocus: () => dispatch({ type: "hover", index: count - 1 }),
    onKeyDown: (event: React.KeyboardEvent<SVGRectElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        release();
        dispatch({ type: "clear" });
        return;
      }
      const index = selection.active ?? count - 1;
      const next =
        event.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : event.key === "ArrowRight"
            ? Math.min(count - 1, index + 1)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? count - 1
                : undefined;
      if (next !== undefined) {
        event.preventDefault();
        release();
        dispatch({
          type: "key",
          index: next,
          extend: event.shiftKey,
          fallback: index,
        });
      }
    },
  };
}

export const scrubStyle = {
  touchAction: "pan-y",
  cursor: "crosshair",
  userSelect: "none",
} as const;
export const scrubHelp =
  "Hover to inspect · Hold and drag to compare · Shift + arrow keys selects · Esc clears";

export function SelectionReadout({
  label,
  children,
  selected,
  onClear,
}: {
  label: ReactNode;
  children: ReactNode;
  selected: boolean;
  onClear: () => void;
}) {
  return (
    // Not a live region: the slider's aria-valuetext already carries these values, so announcing both would repeat them.
    <div
      className="pointer-events-none absolute right-2 top-2 z-10 max-w-[calc(100%-1rem)]"
      data-chart-readout
    >
      <ChartTooltip label={label}>
        {children}
        {selected && (
          <button
            type="button"
            className="pointer-events-auto rounded px-1 text-caption text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            onClick={onClear}
          >
            Clear selection
          </button>
        )}
      </ChartTooltip>
    </div>
  );
}

/** Public scales keep compact charts' hit testing on the actual plot, including numeric and categorical axes. */
export function RechartsScrubber<Row extends Record<string, unknown>>({
  rows,
  xKey,
  lines,
  selection,
  dispatch,
  label,
  helpId,
  valueText,
}: {
  rows: Row[];
  xKey: keyof Row & string;
  lines: { key: string; color: string }[];
  selection: Selection;
  dispatch: Dispatch<SelectionAction>;
  label: string;
  helpId: string;
  valueText: string;
}) {
  const area = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const coordinates = rows.map((row) => xScale?.(row[xKey]));
  const bind = useScrubBindings(rows.length, selection, dispatch, (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!area || !rect.width) return null;
    const pixel =
      area.x +
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
        area.width;
    return nearestCoordinate(coordinates, pixel);
  });
  if (!area || !xScale || !yScale || !rows.length) return null;
  const bounds = selectionBounds(selection);
  const endpoints =
    bounds ?? (selection.active === null ? [] : [selection.active]);
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.cursorLine}>
      <g>
        <g pointerEvents="none" aria-hidden="true">
          {bounds && (
            <rect
              x={coordinates[bounds[0]]}
              y={area.y}
              width={
                (coordinates[bounds[1]] ?? 0) - (coordinates[bounds[0]] ?? 0)
              }
              height={area.height}
              fill="var(--series-1)"
              opacity={0.09}
            />
          )}
          {endpoints.map((index) => (
            <g key={index}>
              <line
                x1={coordinates[index]}
                x2={coordinates[index]}
                y1={area.y}
                y2={area.y + area.height}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
              />
              {lines.map((line) => {
                const value = rows[index][line.key];
                return typeof value === "number" && Number.isFinite(value) ? (
                  <circle
                    key={line.key}
                    cx={coordinates[index]}
                    cy={yScale(value)}
                    r={4}
                    fill={line.color}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                ) : null;
              })}
            </g>
          ))}
        </g>
        <rect
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill="transparent"
          style={scrubStyle}
          tabIndex={0}
          role="slider"
          aria-label={`${label} date`}
          aria-describedby={helpId}
          aria-valuemin={0}
          aria-valuemax={rows.length - 1}
          aria-valuenow={selection.active ?? rows.length - 1}
          aria-valuetext={valueText}
          className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
          {...bind}
        />
      </g>
    </ZIndexLayer>
  );
}

# Financial charts

The app uses Recharts 3.10.1 with the existing theme tokens. No new runtime dependency is needed.

## Shared components

- `src/components/charts/performance-chart.tsx`: responsive daily time series, performance metrics, crosshair, exact-date tooltip, pointer capture for drag/touch, keyboard inspection, and an accessible observations table.
- `src/components/charts/primitives.tsx`: range buttons, tooltip surface, legend, axis typography, and signed formatting.
- `src/lib/charts/selection.ts`: interval selection state, endpoint ordering, and raw-value interval calculations.
- `src/lib/charts/series.ts`: normalization, exact-date alignment, calendar ranges, return rebasing, and nearest-observation lookup. These functions do not depend on React or a chart library.

`PriceChart` uses the full shared system. `CumulativeActiveChart` uses the same renderer for both executive and team attribution, with the page's existing period selector remaining authoritative. That selector shares the range-control primitives, hides presets that would clamp to inception, and bounds custom date inputs to the available history. Attribution links continue to navigate the whole report so the chart, tables, and headline metrics stay consistent. `SectorEffectsChart` keeps its signed, stacked categorical bars and shares the tooltip, legend, grid treatment, and typography. A time scrubber would not be meaningful for its sector axis.

## Data and calculations

Supply `Observation[]` with ISO session dates and a `values` map, plus a series definition for each key. The first series drives the summary. Pass a currency only when the quote provider reports one; S&P 500 levels use index points.

Holding charts request completed daily bars using the existing `getBarsRange` provider for one year plus ten calendar days to cover the starting session. Align the holding and S&P 500 on exact dates before rendering. Unmatched/invalid prices are not forward-filled. Empty overlaps display an explicit empty state.

Range selection is local and requires no request. Presets are shown only when history reaches their cutoff; there is no intraday/1D preset for daily-only data. All means all **loaded** history, not lifetime history. Dates anchor to the latest supplied observation. Month and year subtraction clamps month ends; YTD starts at the previous year-end close. If a cutoff is a weekend or holiday, the baseline is the last available close on or before it. The actual start and end dates are always shown.

Each range calculates `100 * (value / startingValue - 1)` independently for both series. It does not subtract previously calculated returns. Raw starting and selected/latest prices remain available for absolute change and tooltips. A zero or missing baseline cannot produce a percentage return.

Attribution already provides cumulative cash-flow-adjusted returns starting at zero. Its adapter converts them to a growth index (`100 + returnInPercent`), preserving compounding and existing page-wide calculations. The index is explicitly labeled as an index, never portfolio dollars. Missing benchmark observations stay null and break the benchmark line; a missing benchmark is shown as unavailable, never zero. Active return retains basis-point units.

Plots use a calendar-time axis and linear segments through every supplied observation. There is no smoothing, invented intraday data, resampling, or peak-dropping decimation. Sparse series show point markers. The daily history loaded by current pages is small enough to retain every observation; a future intraday adapter should define and test its sampling contract separately. Range transitions fade briefly without interpolating financial values and respect reduced-motion preferences.

## Interaction

Hover snaps to the closest observed timestamp. Press and hold at one observation, then drag to another to compare an interval. Both endpoints receive markers, the selected line and area are highlighted, and the rest of the series dims. The summary and tooltip show chronological start/end values, absolute change, and `100 * (end / start - 1)` for the chosen interval. Both series use the same dates; active return is their return difference in basis points. Dragging backwards selects the same chronological interval. The plot stays rebased to the preset range, so selecting an interval does not move or distort the underlying lines.

Pointer capture keeps a drag active outside the plot. Touch uses the same Pointer Events handler with vertical page scrolling allowed; cancellation resets the unfinished selection. A completed interval remains visible after release, until Clear selection, Escape, a new selection, or a preset change. Keyboard users can Tab to the chart and use Left/Right or Home/End, holding Shift to extend an interval. The slider's accessible value includes both dates and returns. The expandable table exposes every observation in the preset range.

The summary shows the latest close by default and switches to the selected close during inspection. Range changes clear selection and return to the latest close. New series data resets both the range and selection so navigation cannot leave a stale cursor.

## UX references

Reviewed on September 19, 2026:

- [Google Finance: follow and compare securities](https://support.google.com/websearch/answer/7579076?co=GENIE.Platform%3DDesktop&hl=en): comparing securities within the same chart.
- [Google Finance quote page](https://www.google.com/finance/quote/AAPL:NASDAQ): quote/period/comparison context.
- [Robinhood: using charts](https://robinhood.com/us/en/support/articles/using-charts/): basic line charts, selectable time spans and observation intervals, directional performance, and the distinction between price movement and portfolio return.
- [Recharts interaction guidance](https://recharts.github.io/guide/activeIndex/): current interaction APIs. The implementation uses the installed Recharts public plot/scale hooks for one explicit pointer/touch/keyboard state, instead of the removed chart `activeIndex` prop.

The implementation follows the requested interaction patterns using the app's own theme and components. No proprietary source or brand styling was copied.

## Validation

- `npm test`: 269 tests pass, including interval state transitions, reverse selection, release/cancellation, keyboard extension, raw-endpoint calculations, benchmark comparison, zero/missing baselines, and cumulative-index compounding.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- Browser verification with a temporary synthetic-data harness: actual forward/reverse pointer drags, retained interval shading and endpoint markers, exact values for both series, Shift-key selection, Escape, and range reset. No browser errors or warnings. The harness was removed before the production build.
- Authenticated live-provider pages and physical-device touch gestures were not exercised.

The original visuals commit is `c105569`. This follow-up incorporates main through `f2b1fe5`, including earnings-document labels and research citations. Those changes were reviewed for interactions; the shared chart changes do not alter document labels, source resolution, chat rendering, or provider retrieval. Their tests pass in the combined application. A fresh fetch before publishing found no additional main commits.

# Financial charts

The app uses Recharts 3.10.1 with the existing theme tokens. No new runtime dependency is needed.

## Shared components

- `src/components/charts/performance-chart.tsx`: responsive daily time series, performance metrics, crosshair, exact-date tooltip, pointer capture for drag/touch, keyboard inspection, and an accessible observations table.
- `src/components/charts/primitives.tsx`: range buttons, tooltip surface, legend, axis typography, and signed formatting.
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

Hover or press and drag to snap to the closest observed timestamp. Pointer capture keeps a drag active outside the plot. Touch uses the same Pointer Events handler with vertical page scrolling allowed; cancellation resets inspection. Keyboard users can Tab to the chart and use Left/Right, Home/End, or Escape. The slider's accessible value includes the date and both returns. The expandable table exposes every observation in the selected range.

The summary shows the latest close by default and clearly switches to the selected close during inspection. Range changes clear inspection and return to the latest close. New series data resets both the range and inspection so navigation cannot leave a stale cursor.

## UX references

Reviewed on September 19, 2026:

- [Google Finance: follow and compare securities](https://support.google.com/websearch/answer/7579076?co=GENIE.Platform%3DDesktop&hl=en): comparing securities within the same chart.
- [Google Finance quote page](https://www.google.com/finance/quote/AAPL:NASDAQ): quote/period/comparison context.
- [Robinhood: using charts](https://robinhood.com/us/en/support/articles/using-charts/): basic line charts, selectable time spans and observation intervals, directional performance, and the distinction between price movement and portfolio return.
- [Recharts interaction guidance](https://recharts.github.io/guide/activeIndex/): current interaction APIs. The implementation uses the installed Recharts public plot/scale hooks for one explicit pointer/touch/keyboard state, instead of the removed chart `activeIndex` prop.

The implementation follows the requested interaction patterns using the app's own theme and components. No proprietary source or brand styling was copied.

## Validation

- `npm test`: 204 tests pass, including 12 new chart and period-availability tests for alignment, invalid/missing observations, changing baselines, losses, unavailable ranges, month ends/leap years, YTD, irregular-date scrubbing, and retention of dense-series extrema.
- `npm run lint` and TypeScript checks pass.
- `npm run build`: production Turbopack build passes after clearing the sandbox-generated cache and allowing the existing Google Fonts download.
- Browser checks with a temporary synthetic-data harness: 1M versus 1Y recalculation, both series starting at zero, pointer drag, keyboard Home/Arrow/End/Escape, narrow-screen range wrapping and tooltips, dark mode, negative returns, empty/single/two-point data, and a missing benchmark observation. No browser errors or warnings were reported. The harness was removed before the final build.
- Authenticated live-provider pages and physical-device touch gestures were not exercised; browser checks used synthetic observations and narrow-screen pointer input.

The branch starts at `5ea5b06`. A fresh fetch found no subsequent changes on `origin/main`, so there were no intervening main changes or merge conflicts. Existing attribution tests cover the retained index comparison, page periods, basis-point effects, and cash-flow calculations.

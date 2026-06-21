import type { BuildContext, BuildResult, TabModule } from "./lib.ts";

/**
 * Summary tab — the portfolio overview. Currently empty; build it out here.
 *
 * Everything in this module is CODE-MANAGED (structure, formulas, number formats).
 * Prefer structured refs in formulas, e.g. =SUM(Holdings[Value]).
 */
export const summary: TabModule = {
  title: "Summary",
  build(_ctx: BuildContext): BuildResult {
    // TODO: define the Summary layout. `structure` holds batchUpdate requests (formats,
    // merges, ...); `values` holds cell content via the values API (import `valuesAt`):
    //
    //   values: [valuesAt("Summary", [
    //     ["Total Value",    "=SUM(Holdings[Value])"],
    //     ["Unrealized PnL", "=SUM(Holdings[Unreal. PnL])"],
    //     ["Cost Basis",     "=SUM(Holdings[Cost Basis])"],
    //   ])],
    return { structure: [], values: [] };
  },
};

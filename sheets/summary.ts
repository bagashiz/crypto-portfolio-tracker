import type { BuildContext, SheetRequest, TabModule } from "./lib.ts";
// import { setCells } from "./lib.ts";

/**
 * Summary tab — the portfolio overview. Currently empty; build it out here.
 *
 * Everything in this module is CODE-MANAGED (structure, formulas, number formats).
 * Prefer structured refs in formulas, e.g. =SUM(Holdings[Value]).
 */
export const summary: TabModule = {
  title: "Summary",
  build(_ctx: BuildContext): SheetRequest[] {
    // TODO: define the Summary layout. Example (rows/cols are 0-indexed):
    //
    //   return [
    //     setCells(_ctx.sheetId("Summary"), 0, 0, [
    //       ["Total Value",     "=SUM(Holdings[Value])"],
    //       ["Unrealized PnL",  "=SUM(Holdings[Unreal. PnL])"],
    //       ["Cost Basis",      "=SUM(Holdings[Cost Basis])"],
    //     ]),
    //   ];
    return [];
  },
};

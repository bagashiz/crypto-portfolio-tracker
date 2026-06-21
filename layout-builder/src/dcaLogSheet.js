// layout-builder DCA Log sheet definition (local-only Node / ESM runtime).
//
// HIGHEST STAKES (LAYOUT-02): the DCA Log holds hand-entered transaction history.
// A wrong batchUpdate range here is irreversible data loss. The safety mechanism is
// the simplest provably-correct one (D-06): `--update` NEVER references the data
// region. It only emits requests for the fixed top-of-data band; the data rows are
// never addressed, so they cannot be written or cleared.
//
// Top-of-data band layout (D-05) — positioned from the FIXED boundary, NOT assets.length:
//   row 1                            : summary block header ("Summary" + summary metric labels)
//   rows 2..(1+N)                    : one per-asset summary row (label = asset id), N = assets.length
//   rows (2+N)..(1+MAX_SUMMARY_ROWS) : reserved-but-unused summary rows (blank, format-only)
//   row (2+MAX_SUMMARY_ROWS)         : transaction column header row (row 22, Date..Notes A-I)
//   row DATA_START_ROW.. (row 23+)   : transaction DATA rows (user-entered, unbounded) -- NEVER touched.
//
// The band is positioned from the FIXED DATA_START_ROW (23) / MAX_SUMMARY_ROWS (20)
// reservation in config.js — it is NEVER derived from assets.length. This closes the
// LAYOUT-02 floating-boundary defect: a one-line registry edit can no longer move the
// transaction header onto a live DCA data row. Per-asset summary labels fill top-down up
// to assets.length; the reserved rows below stay blank; and assets.length > MAX_SUMMARY_ROWS
// fails loudly (below) rather than silently shifting the boundary into the data region.
//
// SUMMARY FORMULAS (Phase 5, D-04/D-06): the per-asset summary band (rows 2..1+N)
// now carries BUY-only cost-basis formulas — Total Invested, Total Qty, DCA-weighted
// Avg Cost, Buy Count, Last Buy, Total Fees — computed via SUMIFS/COUNTIFS/MAXIFS over
// open-ended A{DATA_START_ROW}:A ranges that READ the data region but never WRITE it.
// Every leaf is wrapped in IFERROR(…, "—") so an asset with no BUY rows reads "—" not
// #DIV/0!. This is the single source of truth for avg cost (the Dashboard AvgCost cell
// references it, D-03). SELL rows are ignored — realized PnL is Phase 6 (D-04).
//
// STILL NO conditional formatting on this tab (only the Dashboard, D-07) and NO
// data-validation dropdowns (PNL-06 v2-deferred). The open-ended ranges appear ONLY
// inside formula STRINGS; every emitted request range stays strictly above DATA_START_ROW
// (the irreversible-data-loss guard, LAYOUT-02 / D-06).

import { assets, DCA_LOG, DATA_START_ROW, MAX_SUMMARY_ROWS } from "./config.js";

// Phase 6 (D-04/D-07): SELL semantics + realized PnL. The Transaction Log now books a
// per-row realized-PnL helper (col J, a single row-22 BYROW spill), per-asset realized
// summary metrics (Sold Qty / Net Proceeds / Realized $ / Realized %), a portfolio Total
// Realized cell, and green/red conditional formatting on the Realized summary cells. ALL
// of this stays strictly above DATA_START_ROW (23): the only thing that "touches" the data
// region is a formula STRING inside the row-22 spill cell — never a request range (D-06).

// --- Layout constants (positioned from the FIXED boundary, never from assets.length) ---

const SUMMARY_HEADER_ROW = 1; // 1-based
const FIRST_SUMMARY_ROW = 2; // first per-asset summary row
// Last row of the reserved summary block (1-based): row (1 + MAX_SUMMARY_ROWS) = 21.
const LAST_RESERVED_SUMMARY_ROW = 1 + MAX_SUMMARY_ROWS;
const SUMMARY_HEADERS = [
  "Summary", // col A
  "Total Invested", // col B  (Phase 5 BUY-only)
  "Total Qty", // col C
  "Avg Cost (DCA)", // col D
  "Buy Count", // col E
  "Last Buy", // col F
  "Total Fees", // col G
  // Phase 6 realized block (cols H-K), emitted by the SELL-only summary loop:
  "Sold Qty", // col H
  "Net Proceeds", // col I
  "Realized $", // col J
  "Realized %", // col K
  "Total Realized", // col L — portfolio-wide SUM of per-asset Realized $
];

// Transaction header row sits immediately above the data region.
const TX_HEADER_ROW = DATA_START_ROW - 1; // 1-based
// Phase 6 (D-02): the transaction header gains a 10th column, "Realized" (col J). This is
// the per-row realized-PnL helper whose row-22 header cell carries the BYROW spill formula;
// the spill fills col J for every SELL data row below (BUY/blank rows spill empty).
const TX_HEADERS = ["Date", "Asset", "Type", "Price", "Qty", "Total", "Fee", "Net Cost", "Notes", "Realized"];

const CURRENCY_FORMAT = { type: "CURRENCY", pattern: "$#,##0.00" };
const DATE_FORMAT = { type: "DATE", pattern: "yyyy-mm-dd" };
// Phase 6 (D-06): percent format for the Realized % summary column (copied from
// dashboardSheet.js — same shape so both tabs render percentages identically).
const PERCENT_FORMAT = { type: "PERCENT", pattern: "0.00%" };

// --- Request helpers ---

function stringCell(value) {
  return { userEnteredValue: { stringValue: value } };
}

// Mirror of stringCell, emitting a formula payload. The formula string begins with "=".
function formulaCell(formula) {
  return { userEnteredValue: { formulaValue: formula } };
}

function labelRowRequest(sheetId, row, startCol, labels) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: labels.map(stringCell) }],
    },
  };
}

// Mirror of labelRowRequest, mapping each entry through formulaCell. `row`/`startCol`
// are 1-based and converted to 0-based. The request range spans exactly one row at
// `row` — the open-ended A{DATA_START_ROW}:A ranges live ONLY inside the formula
// strings, so this request never addresses the data region (LAYOUT-02 / D-06).
function formulaRowRequest(sheetId, row, startCol, formulas) {
  return {
    updateCells: {
      fields: "userEnteredValue",
      start: { sheetId, rowIndex: row - 1, columnIndex: startCol - 1 },
      rows: [{ values: formulas.map(formulaCell) }],
    },
  };
}

function numberFormatRequest(sheetId, startRow, endRow, startCol, endCol, numberFormat) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow, // exclusive (1-based-inclusive end -> exclusive)
        startColumnIndex: startCol - 1,
        endColumnIndex: endCol, // exclusive
      },
      cell: { userEnteredFormat: { numberFormat } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

// --- Conditional formatting (Phase 6 / D-07) — copied from dashboardSheet.js (Option A,
// lowest churn: no shared-module extraction). The log tab now gets green/red fills on the
// Realized $ + Realized % summary cells, mirroring the Dashboard PnL coloring. ---

// Light green / light red background fills (background-fill, not text color).
const GREEN_FILL = { red: 0.72, green: 0.88, blue: 0.74 };
const RED_FILL = { red: 0.96, green: 0.8, blue: 0.8 };

// addConditionalFormatRule request (Sheets v4). `condition` is a BooleanCondition;
// `fill` is a backgroundColor RGB; `range` is a 0-based GridRange; `index` positions the
// managed rule (0..N-1).
function addConditionalFormatRuleRequest(sheetId, range, condition, fill, index) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, ...range }],
        booleanRule: { condition, format: { backgroundColor: fill } },
      },
      index,
    },
  };
}

// deleteConditionalFormatRule at a given 0-based index on a sheet (idempotency).
function deleteConditionalFormatRuleRequest(sheetId, index) {
  return { deleteConditionalFormatRule: { sheetId, index } };
}

// The log tab has exactly 2 managed conditional-format rules: green Realized>0, red
// Realized<0 (no drift rule on this tab). On --update, addConditionalFormatRule STACKS on
// naive re-add, so update pre-clears the managed indices FIRST in DESCENDING order
// ([N-1..0]) before re-adding — converging to exactly 2 rules. Build emits NO deletes (a
// freshly-created tab has 0 rules; deleting a nonexistent index would roll back the atomic
// build batch — same gating rationale as dashboardSheet.js).
const DCA_LOG_MANAGED_RULE_COUNT = 2;

function freezeRowsRequest(sheetId, count) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: count } },
      fields: "gridProperties.frozenRowCount",
    },
  };
}

// The fixed structural band — and ONLY the band. Every range below is bounded strictly
// above DATA_START_ROW (the FIXED boundary, row 23). No request addresses any row at or
// beyond the data region (the irreversible-data-loss guard, LAYOUT-02 / D-06). The band
// is positioned from the fixed boundary, NOT assets.length, so a registry edit can never
// shift it. This is also why build and update share the same set: there is no separate
// "clear data" step to get wrong.
//
// `assetList` defaults to the shared registry; an explicit list is accepted only so the
// overflow guard and boundary-invariance can be exercised without mutating the import.
//
// The band is ADD-ONLY for conditional rules: it NEVER emits inline deletes. The managed
// rule pre-clear is split into dcaLogConditionalPreClearRequests, sent by index.js in its
// OWN error-tolerant batch (WR-01) — so a rule-count drift can never roll back this
// structural batch. (Mirrors dashboardSheet.js: dashboardUpdateRequests is add-only too.)
function bandRequests(sheetId, assetList = assets) {
  // FAIL LOUDLY rather than silently shift the boundary into the data region. If the
  // registry outgrows the reserved summary block, the operator must raise MAX_SUMMARY_ROWS
  // in config.js and re-run --build — never let the band creep onto live transactions.
  if (assetList.length > MAX_SUMMARY_ROWS) {
    throw new Error(
      `assets.length (${assetList.length}) exceeds MAX_SUMMARY_ROWS (${MAX_SUMMARY_ROWS}); ` +
        "increase MAX_SUMMARY_ROWS in config.js and re-run --build — refusing to silently " +
        "shift DATA_START_ROW into the DCA Log data region (LAYOUT-02)."
    );
  }

  const requests = [];

  // Freeze the summary block + transaction header (everything above the data region).
  requests.push(freezeRowsRequest(sheetId, TX_HEADER_ROW));

  // Summary block header row.
  requests.push(labelRowRequest(sheetId, SUMMARY_HEADER_ROW, 1, SUMMARY_HEADERS));

  // One summary row per asset, filling the reserved block TOP-DOWN (rows 2..1+N). The
  // reserved-but-unused rows (N+2..1+MAX_SUMMARY_ROWS) receive NO label request — they
  // stay blank (label only — Phase 5 fills SUMIF metrics, D-07/D-08).
  assetList.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    requests.push(labelRowRequest(sheetId, row, 1, [asset.id]));
  });

  // BUY-only cost-basis summary formulas, one row per asset (rows 2..1+N), starting at
  // column B (col 2). Each cell references the open-ended transaction data region via
  // A{dataAnchor}:A ranges INSIDE the formula string only — the request range itself is a
  // single summary row, never the data region (D-04/D-06). The summary row's own asset id
  // sits in column A (already emitted above) and is the SUMIFS criterion ($A{row}).
  //
  // TX column map (per PATTERNS.md / D-04): Date=A, Asset=B, Type=C, Price=D, Qty=E,
  // Total=F, Fee=G, Net Cost=H. Summary metric columns: Total Invested=B, Total Qty=C,
  // Avg Cost=D, Buy Count=E, Last Buy=F, Total Fees=G.
  //
  // `dataAnchor` is derived from the imported DATA_START_ROW constant so the formula
  // strings track the fixed boundary (currently 23) — never a hard-coded literal here.
  const dataAnchor = DATA_START_ROW;
  assetList.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    const a = `$A${row}`; // this summary row's asset id (SUMIFS criterion)
    const buyFilter = `$C$${dataAnchor}:$C,"BUY"`;
    const assetFilter = `$B$${dataAnchor}:$B,${a}`;
    const totalInvested = `SUMIFS($H$${dataAnchor}:$H,${assetFilter},${buyFilter})`;
    const totalQty = `SUMIFS($E$${dataAnchor}:$E,${assetFilter},${buyFilter})`;
    const formulas = [
      // Total Invested (B)
      `=IFERROR(${totalInvested},"—")`,
      // Total Qty (C)
      `=IFERROR(${totalQty},"—")`,
      // Avg Cost (D) — DCA-weighted: Invested / Qty (single source of truth)
      `=IFERROR(${totalInvested}/${totalQty},"—")`,
      // Buy Count (E)
      `=IFERROR(COUNTIFS(${assetFilter},${buyFilter}),"—")`,
      // Last Buy (F)
      `=IFERROR(MAXIFS($A$${dataAnchor}:$A,${assetFilter},${buyFilter}),"—")`,
      // Total Fees (G)
      `=IFERROR(SUMIFS($G$${dataAnchor}:$G,${assetFilter},${buyFilter}),"—")`,
    ];
    requests.push(formulaRowRequest(sheetId, row, 2, formulas));
  });

  // --- Phase 6: per-asset REALIZED summary loop (SELL-only), separate from the BUY loop ---
  //
  // A strictly separate Type="SELL" filter and a new startCol (col H = 8) so the Phase 5
  // BUY-only loop above is left byte-for-byte unchanged (D-04 / threat T-06-03). Columns:
  //   Sold Qty=H, Net Proceeds=I, Realized $=J, Realized %=K.
  // Realized $ sums the col-J "Realized" data-region helper (filled by the BYROW spill).
  // Realized % uses the Pitfall-4 denominator: costBasisSold = NetProceeds − Realized$,
  // so % = Realized$ / (NetProceeds − Realized$) — NEVER the current Avg Cost cell.
  assetList.forEach((asset, i) => {
    const row = FIRST_SUMMARY_ROW + i;
    const a = `$A${row}`; // this summary row's asset id (SUMIFS criterion)
    const sellFilter = `$C$${dataAnchor}:$C,"SELL"`;
    const assetFilter = `$B$${dataAnchor}:$B,${a}`;
    const soldQty = `SUMIFS($E$${dataAnchor}:$E,${assetFilter},${sellFilter})`;
    const netProceeds =
      `SUMIFS($F$${dataAnchor}:$F,${assetFilter},${sellFilter}) - ` +
      `SUMIFS($G$${dataAnchor}:$G,${assetFilter},${sellFilter})`;
    // Realized $ : SUM the col-J helper for this asset's SELL rows.
    const realizedDollars = `SUMIFS($J$${dataAnchor}:$J,${assetFilter},${sellFilter})`;
    const realizedPct = `${realizedDollars} / ( ${netProceeds} - ${realizedDollars} )`;
    const realizedFormulas = [
      // Sold Qty (H)
      `=IFERROR(${soldQty},"—")`,
      // Net Proceeds (I)
      `=IFERROR(${netProceeds},"—")`,
      // Realized $ (J)
      `=IFERROR(${realizedDollars},"—")`,
      // Realized % (K)
      `=IFERROR(${realizedPct},"—")`,
    ];
    requests.push(formulaRowRequest(sheetId, row, 8, realizedFormulas));
  });

  // Portfolio Total Realized cell (D-03 / D-06): a SINGLE summary-band cell summing the
  // per-asset Realized $ column (col J) over the used summary rows (2..1+N). Placed in the
  // summary header row (row 1) at col L (12) — the "Total Realized" labeled column — so it
  // is NOT in the data region and NOT on the Dashboard. SUM skips the "—" text leaves.
  const totalRealizedCol = 12; // col L (1-based)
  const totalRealized = `=IFERROR(SUM($J$${FIRST_SUMMARY_ROW}:$J$${1 + assetList.length}),"—")`;
  requests.push(formulaRowRequest(sheetId, SUMMARY_HEADER_ROW, totalRealizedCol, [totalRealized]));

  // Phase 6 realized-block number formats over the reserved summary block (rows 2..21),
  // still strictly above the data region (endRowIndex 21 < boundary 22). Sold Qty (H),
  // Net Proceeds (I), Realized $ (J) are currency; Realized % (K) is percent.
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, LAST_RESERVED_SUMMARY_ROW, 8, 8, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, LAST_RESERVED_SUMMARY_ROW, 9, 9, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, LAST_RESERVED_SUMMARY_ROW, 10, 10, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, LAST_RESERVED_SUMMARY_ROW, 11, 11, PERCENT_FORMAT));

  // Summary number formats span the FULL reserved block (rows 2..1+MAX_SUMMARY_ROWS = 2-21),
  // not just the used rows — the reserved rows are still strictly above the data region
  // (endRowIndex = MAX_SUMMARY_ROWS + 1 = 21, exclusive 21 < boundary 22). Formats are
  // allowed in the blank reserved rows because they carry no value (D-08 label/format-only).
  const reservedEnd = LAST_RESERVED_SUMMARY_ROW; // 1-based inclusive end (21)
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 2, 2, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 4, 4, CURRENCY_FORMAT));
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 7, 7, CURRENCY_FORMAT));
  // Last Buy (col F = 6) is a date (MAXIFS over the Date column) — format it as a date
  // over the same reserved block. Still strictly above the data region (endRowIndex 21 < 22).
  requests.push(numberFormatRequest(sheetId, FIRST_SUMMARY_ROW, reservedEnd, 6, 6, DATE_FORMAT));

  // Transaction header row (cols A-J), immediately above the data region.
  requests.push(labelRowRequest(sheetId, TX_HEADER_ROW, 1, TX_HEADERS));

  // Phase 6 (D-02): the per-row REALIZED spill. A SINGLE write to row 22 (TX_HEADER_ROW =
  // DATA_START_ROW − 1), col J (10), replacing the col-J "Realized" header text with the
  // BYROW spill formula. The open-ended ranges live ONLY inside the formula STRING — the
  // request range is row 22 only, so the data region is never addressed (D-06).
  //
  // SPILL ALIGNMENT (critical): BYROW returns one output row per INPUT row and spills DOWN
  // from this anchor cell (J22). For output[k] to land on its own source row, the input's
  // FIRST row MUST equal the anchor row — so the input is A{TX_HEADER_ROW}:I (A22:I), NOT
  // A{DATA_START_ROW}:I. With A22:I: row 22 (the header strings) evaluates to "" (Type<>SELL)
  // and lands harmlessly in J22, then row 23 → J23, row 24 → J24, … so the per-asset summary
  // SUMIFS($J$23:$J, …) reads each SELL's realized value from its OWN data row. Anchoring the
  // input at row 23 would shift every value up one cell and silently zero the summary.
  //
  // WHOLE-ROW BYROW(A:I) construction (RESEARCH lines 266-277, recommended): each row's own
  // cells are read positionally via INDEX(r,1,n), avoiding the duplicate-date MATCH bug. For
  // each row: header/blank → ""; non-SELL → ""; SELL → (Total−Fee) − Qty × avgCostAsOf(date),
  // where avgCostAsOf = BUY-weighted running average over BUY rows dated <= the SELL date
  // (inner SUMIFS stay anchored at the data region A{da}:A, da=23). IFERROR guards a SELL
  // dated before any BUY (no cost basis yet) → "—". This write MUST come AFTER the TX header
  // label so the spill formula wins the J22 cell.
  const da = dataAnchor;
  const realizedHeaderFormula =
    `=BYROW(A${TX_HEADER_ROW}:I, LAMBDA(r, LET(` +
    `d, INDEX(r,1,1), ty, INDEX(r,1,3), q, INDEX(r,1,5), tot, INDEX(r,1,6), fee, INDEX(r,1,7), ` +
    `IF(d="","", ` +
    `IF(ty<>"SELL","", ` +
    `IFERROR((tot-fee) - q * ( ` +
    `SUMIFS(H${da}:H, C${da}:C,"BUY", A${da}:A,"<="&d) / ` +
    `SUMIFS(E${da}:E, C${da}:C,"BUY", A${da}:A,"<="&d) ` +
    `),"—"))))))`;
  requests.push(formulaRowRequest(sheetId, TX_HEADER_ROW, 10, [realizedHeaderFormula]));

  // Number format for the transaction header row's Date column only (header text row).
  // NOTE: we deliberately format only the header row, NOT the data region below it —
  // formatting DATA_START_ROW.. would address the protected data rows (D-06). Phase 5
  // may extend formatting into the data region if it does so without clearing values.
  requests.push(numberFormatRequest(sheetId, TX_HEADER_ROW, TX_HEADER_ROW, 1, 1, DATE_FORMAT));

  // Phase 6 (D-07): green/red conditional formatting on the Realized $ (col J, 0-based 9)
  // and Realized % (col K, 0-based 10) summary cells over the per-asset rows (rows 2..1+N,
  // 0-based startRowIndex 1 .. endRowIndex 1+N). The range ends well above row 22 (summary
  // band only) — no data-region concern (the critical guard stays green). This band is
  // ADD-ONLY: the managed-rule pre-clear (descending deletes) is emitted separately by
  // dcaLogConditionalPreClearRequests and sent by index.js in its own error-tolerant batch,
  // so a rule-count drift can never roll back this structural re-apply (WR-01/WR-02). On
  // --build the isolated pre-clear runs on a 0-rule tab and tolerantly no-ops.
  const realizedRange = {
    startRowIndex: FIRST_SUMMARY_ROW - 1, // 0-based 1 (row 2)
    endRowIndex: 1 + assetList.length, // exclusive; last per-asset row is 1+N (1-based)
    startColumnIndex: 9, // col J (Realized $)
    endColumnIndex: 11, // exclusive → cols J, K (Realized $, Realized %)
  };
  const greaterThanZero = { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] };
  const lessThanZero = { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] };
  requests.push(addConditionalFormatRuleRequest(sheetId, realizedRange, greaterThanZero, GREEN_FILL, 0));
  requests.push(addConditionalFormatRuleRequest(sheetId, realizedRange, lessThanZero, RED_FILL, 1));

  return requests;
}

// Build the DCA Log top-of-data skeleton (first-time --build).
// `assetList` defaults to the shared registry (tests pass an explicit list to drive the
// overflow guard / boundary-invariance without mutating the import).
export function dcaLogBuildRequests(sheetId, assetList = assets) {
  // Build: add-only conditional rules (the tab is freshly created in the same atomic
  // batchUpdate, so it has 0 rules to pre-clear).
  return bandRequests(sheetId, assetList);
}

// Re-apply ONLY the structural band (--update). The transaction data region at and
// below DATA_START_ROW is never addressed — no write, no clear — so re-running --update
// leaves DCA Log data byte-for-byte unchanged and "twice == once" (D-06, LAYOUT-02).
export function dcaLogUpdateRequests(sheetId, assetList = assets) {
  // Update: ADD-ONLY structural band (no inline deletes). The managed conditional rules are
  // pre-cleared by dcaLogConditionalPreClearRequests, which index.js sends in its OWN
  // error-tolerant batch BEFORE this structural batch (WR-01/WR-02). Emitting the deletes
  // here too would (a) double-delete and (b) throw inside the un-tolerant structural batch
  // once the isolated pre-clear has already removed the rules — rolling back the re-apply.
  return bandRequests(sheetId, assetList);
}

// The descending-index conditional-format pre-clear deletes for --update, isolated so
// index.js (Plan 02) can send them in a SEPARATE, error-tolerant batchUpdate — the
// structural batch must never be rolled back by an out-of-range delete on rule-count drift.
// Mirrors dashboardConditionalPreClearRequests. Emits [DCA_LOG_MANAGED_RULE_COUNT-1 .. 0].
export function dcaLogConditionalPreClearRequests(sheetId) {
  const requests = [];
  for (let i = DCA_LOG_MANAGED_RULE_COUNT - 1; i >= 0; i--) {
    requests.push(deleteConditionalFormatRuleRequest(sheetId, i));
  }
  return requests;
}

// Re-export the sheet name so callers (index.js) resolve the target tab via one place.
export { DCA_LOG };

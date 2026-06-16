---
phase: 02
slug: layout-builder
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| local filesystem → service-account JWT | `service-account.key.json` read from disk by auth.js | Long-lived private credential (high sensitivity) |
| `.env` → config.js / node runtime | SPREADSHEET_ID supplied via gitignored `.env` (`--env-file`) | Personal sheet identifier |
| CLI args (process.argv) → dispatch | Local operator selecting `--build` vs `--update` | Operator intent |
| builder request set → Google Sheets API | request ranges define what `--build`/`--update` writes/clears | Irreversible writes to live spreadsheet (DCA transaction data) |
| asset registry (assets.json) → DCA Log band layout | a CONFIG-01 registry edit drives band geometry | Data-region boundary contract |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Information Disclosure | service-account.key.json committed/logged | mitigate | `.gitignore:26-27` (`*.key.json`, `service-account.key.json`); `auth.js:26-32` reads via `keyFile` only, never logs key; no key in error surface | closed |
| T-02-02 | Information Disclosure | SPREADSHEET_ID in git history | mitigate | `config.js:29` reads `process.env.SPREADSHEET_ID` (via lazy `getSpreadsheetId()`, WR-03); `.gitignore:19` covers `.env`; no literal ID committed | closed |
| T-02-03 | Tampering / data loss | dcaLogUpdateRequests addresses DCA Log data region | mitigate | `dcaLogSheet.test.js:65-79` critical range assertion bounds all update ranges above DATA_START_ROW; suite green | closed |
| T-02-04 | Elevation of Privilege | over-broad OAuth scope | accept | `auth.js:17-19` single scope `auth/spreadsheets`; no Drive-wide/admin scope | closed |
| T-02-05 | Tampering / data loss | `--build` overwrites an existing populated sheet | mitigate | `index.js:90-97` D-04 guard refuses + exits non-zero if Dashboard/DCA Log tab exists; never `spreadsheets.create` on existing tab | closed |
| T-02-06 | Tampering / data loss | `--update` writes/clears DCA Log data region | mitigate | `index.js:141-144` appends only bounded Plan-01 builders; no ad-hoc range write/clear | closed |
| T-02-07 | Information Disclosure | SPREADSHEET_ID leaks via committed config/scripts | mitigate | `package.json:6-7` scripts use `node --env-file=.env`, no literal ID | closed |
| T-02-08 | Denial of Service | unhandled API/auth error aborts opaquely | accept | `index.js:171-182` actionable error messages; on-demand local CLI, no availability SLA | closed |
| T-02-09 | Tampering / data loss | Floating DATA_START_ROW re-stamps transaction header onto a live data row after a registry edit | mitigate | `config.js:74` `DATA_START_ROW = MAX_SUMMARY_ROWS + 3` (literal 23, no `assets.length` term); band positioned from fixed boundary | closed |
| T-02-10 | Tampering / data loss | Test suite blind to floating-boundary overwrite | mitigate | `dcaLogSheet.test.js:21` anchors to hard literal 23; :83-105 registry-mutation invariance + boundary tests | closed |
| T-02-11 | Tampering / data loss | Registry grows beyond reserved block, silently shifts boundary into data region | mitigate | `dcaLogSheet.js:106-112` throws when `assetList.length > MAX_SUMMARY_ROWS` (fail-closed); proven by `dcaLogSheet.test.js:120-126` | closed |
| T-02-12 | Tampering | Reserved blank summary rows carry formulas/conditional formatting (past D-08) | mitigate | `dcaLogSheet.test.js:138-145` skeleton-only assertions (no `formulaValue` / no `addConditionalFormatRule`) over build + update | closed |
| T-02-SC | Tampering | npm/package installs (supply chain) | accept | No new package-manager installs; `googleapis` declared in Phase 1; no install task in any phase-02 plan | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-04 | Single `auth/spreadsheets` scope is least-privilege for writing structure to a pre-shared sheet; no Drive-wide or admin scope requested | Bagas Hizbullah | 2026-06-16 |
| AR-02-02 | T-02-08 | Errors are surfaced with actionable messages; this is an on-demand local CLI run by one operator with no availability SLA | Bagas Hizbullah | 2026-06-16 |
| AR-02-03 | T-02-SC | No new dependencies introduced in Phase 02; `googleapis` was vetted/declared in Phase 1; nothing to re-audit | Bagas Hizbullah | 2026-06-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-16 | 13 | 13 | 0 | gsd-security-auditor |

### Notes (informational, not gaps)
- T-02-02 mitigation realized via lazy `getSpreadsheetId()` (config.js:28-37, WR-03 deviation) rather than a top-level constant; still reads `process.env.SPREADSHEET_ID` and never commits the ID — intent preserved.
- Dashboard builder (`dashboardSheet.js`) carries an analogous loud overflow guard mirroring T-02-11 (added via code-review fix CR-01), reinforcing data-safety on the Dashboard zone.
- Operational follow-up (out of scope for this register): the service-account key's private material entered a session transcript during UAT setup; rotate the key as a precaution.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-16

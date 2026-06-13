# Concerns

**Analysis Date:** 2026-06-13

> **State note:** The repository is a fresh `bun init` scaffold (Bun `1.3.14`). The only executable code is `index.ts` (`console.log("Hello via Bun!")`) — no app code, no tests, no `layout-builder/` or `apps-script/` directories. The real substance is the build spec at `PLAN.md`. Concerns are therefore mostly **forward-looking**: planned-architecture risk plus plan/scaffold gaps. Build status: **step 0 of 8** (`PLAN.md` §7) — nothing in §3–§5 is built.

## Highest Priority — Security / `.gitignore`

`.gitignore` does **not** ignore the secret/key files the plan mandates (`PLAN.md` §3, §6.9):
- `*.key.json` / `service-account.key.json`
- `.clasp.json`
- `apps-script/dist/`

It currently ignores only `.env*` and `.claude`. The project handles real Hyperliquid + Solana wallets and a service-account key — **this must be fixed before any key file is created**, or a credential could be committed. _(Read-only wallets limit blast radius, but the service-account key grants Sheets write access.)_

## Tech Debt

- **Leftover scaffold** — `index.ts` is `bun init` boilerplate; `package.json` `"module"` points at it. Does not reflect the planned two-runtime layout.
- **Single flat dependency set** — one root `package.json` / `bun.lock` vs. the plan's mandated **two separate** dependency sets (`PLAN.md` §2). Missing `googleapis` (layout builder) and `@google/clasp`, `@types/google-apps-script`, esbuild/tsc (apps-script).
- **No build/deploy path** — no `scripts` block; `PLAN.md` §6.9 wants a `"deploy": "build && clasp push"` and documented `clasp login` flow.
- **Non-reproducible pins** — `"latest"` pins in `package.json` (`@types/bun`) and `mise.toml` (`bun` / `node`) → non-deterministic builds.
- **Stale ignore** — `.gitignore` line 37 ignores `mise.toml`, but `mise.toml` is tracked — inconsistent.

## Fragile Areas (planned)

- **Apps Script global-scope linking** (`PLAN.md` §2) — trigger entry points (`refreshAll`, `installTrigger`) must be top-level globals in compiled output. ES `import`/`export` between source files breaks Apps Script linking unless the bundler inlines everything into one flat file. **Fails only at deploy time**, not at compile time — easy to miss.
- **Layout `--update` idempotency** (`PLAN.md` §4, §6.5) — a wrong `batchUpdate` range can wipe the user's hand-entered DCA Log history. **Irreversible data loss.** Needs dry-run / narrow explicit ranges and test coverage.
- **Single-blob cache `PRICES_ALL`** (`PLAN.md` §5.3, §6.3) — one provider failure can blank all data unless each provider has independent try/catch + a `Stale?` status cell (graceful degradation).

## Performance (planned)

- **Public Solana RPC rate limits** — `getTokenAccountsByOwner` polled every 5 min on a public RPC will rate-limit (`PLAN.md` §8). Mitigation: dedicated RPC + gate behind a `FETCH_BALANCES` flag, starting with manual holdings.
- **Jupiter Portfolio cost** — the Portfolio endpoint costs 100 credits/call; already correctly ruled out in the plan in favor of raw RPC for balances.

## Latent Bugs / Open Items (`PLAN.md` §8)

Unconfirmed values that **fail silently** (blank price / wrong asset) if wrong:
- Hyperliquid tokenized-gold ticker (`XAUT` vs other)
- The four Solana mint addresses (IVVon, PST, ONyc, USDy)
- Solana RPC endpoint choice (public vs paid)
- Refresh interval (default assumed 5 min)

These are coding-blockers — confirm before implementing the provider layer (`PLAN.md` §7 steps 3–4).

## Testing Gaps

Zero tests, zero infra (only Bun's built-in `bun test`).
- **High:** unit-test layout `--update` idempotency (data-loss risk).
- **Medium:** mock HL / Jupiter / RPC JSON parsing.
- **Low / manual:** Apps Script triggers via `clasp push`.

See `TESTING.md` for the full prescribed approach.

---

*Concerns analysis: 2026-06-13*

# SESSION_REPORT.md — Bitget Agentic Trading (Hackathon S2)

## Session 0: Research & Scoping
**Date:** 2026-09-18
**Goal:** Confirm event rules, prior art, and technical feasibility before writing any code.

**Event rules (from the official S2 rules doc):**
- Track: **Agentic Trading**. Submission deadline **Sept 21, 2026, UTC+8** — as of this
  session, that is **3 days away** (today is Sept 18; the original build-reference doc's
  "8 days left" estimate is stale — plan accordingly, especially the paper-trading log length).
- Scoring: 50% quantitative (paper-trading Sharpe, max drawdown, win rate) + 50% judge
  (decision explainability, Agent architecture quality, risk control layer effectiveness).
- Award: 1 winner per named sub-theme (500 USDT) or top 1 of 2 Open Theme slots (500 USDT);
  only highest tier counts per entry.
- Required materials: runnable Demo, event→decision→execution write-up, paper-trading log
  (recommended ≥2 weeks — not achievable from today; report the real, shorter window
  honestly rather than implying otherwise), compliant X post (`#BitgetHackathon` `@Bitget_AI`).

**Prior art:** github.com/angelraph/gloaming — a public reference submission for this same
hackathon reportedly used the virtual-ledger approach (see Section 3 architecture decision
below). Not inspected in depth this session; worth a quick look before Session 2 to avoid
converging on the same specific idea, not just the same infrastructure pattern.

**Feasibility spot-check (done live this session, see "Verified this session" below):**
Confirmed `@bitget-ai/bitget-agent-sdk` is a real, installable npm package with public
market-data access requiring no API key. Did **not** confirm rToken-specific field/category
names — that's Session 2's first step (`npm run discover`), not guessable from documentation
pages alone.

**One-line pitch (draft, pending sub-theme decision — see "Open decisions" below):**
> An Agent that watches the Friday-close → weekend order-flow drift on rTokens (the one
> mechanic that only exists because rTokens trade when NYSE/NASDAQ don't) and decides,
> under an explicit non-LLM risk gate, whether to fade or ride that drift into Monday's open.

This pitch was chosen because the build window (Sept 18 Fri → Sept 21 Mon deadline) *is* a
live weekend — this is the one sub-theme angle that can be logged as real, not backtested or
hypothetical, data inside the time actually available. Needs the user's confirmation (see
below) before Session 2 commits to it.

---

## Session 1: Core Infrastructure
**Date:** 2026-09-18
**Goal:** Theme-agnostic scaffold — Bitget market-data wrapper, virtual paper-trading ledger,
non-LLM risk gate, LLM decision client, decision logging, single-cycle loop, and a demo
dashboard. No sub-theme-specific "sense" logic yet — that's Session 2, gated on the open
decision below.

**Files added:**
- `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` — Node 22 / TypeScript, ESM
- `src/config.ts` — env loading, risk-gate + ledger defaults
- `src/bitget/client.ts` — `@bitget-ai/bitget-agent-sdk` wrapper, public `market` module only,
  `readOnly: true`. Flags 3 unverified assumptions at the top of the file (see README).
- `src/ledger/virtualLedger.ts` — paper positions/fills/equity-curve/drawdown, with
  `toJSON`/`fromJSON` so state survives across separately-scheduled cron invocations
- `src/risk/riskGate.ts` — symbol whitelist, position-size cap, drawdown circuit breaker,
  daily loss limit, weekend market-order veto
- `src/decision/llmClient.ts`, `src/decision/tools.ts` — Anthropic Messages API wrapper +
  the JSON contract the LLM must respond in
- `src/logging/decisionLog.ts` — append-only `logs/decision-log.jsonl`
- `src/loop/runOnce.ts` — one full cycle, loads/saves ledger state to disk, exposes
  `extraContext` for Session 2 to inject sub-theme data into
- `scripts/discover.ts` — **run this first**, prints Bitget's real market-data schema
- `scripts/run.ts` — CLI entry (`--dry` flag for a no-write sanity run)
- `dashboard/index.html` — reads `logs/decision-log.jsonl`, shows equity curve (Chart.js via
  CDN) + an expandable reasoning row per cycle
- `README.md` — quick start, architecture rationale, scheduling instructions

**Current full file tree:**
```
.
├── .env.example
├── .gitignore
├── README.md
├── SESSION_REPORT.md
├── package.json
├── tsconfig.json
├── dashboard/
│   └── index.html
├── logs/
│   └── .gitkeep
├── scripts/
│   ├── discover.ts
│   └── run.ts
└── src/
    ├── config.ts
    ├── bitget/client.ts
    ├── decision/llmClient.ts
    ├── decision/tools.ts
    ├── ledger/virtualLedger.ts
    ├── logging/decisionLog.ts
    ├── loop/runOnce.ts
    └── risk/riskGate.ts
```

**Dependencies declared (not yet installed — no network in the build container):**
- `@bitget-ai/bitget-agent-sdk@latest` — public market data, zero runtime deps, Node ≥20 ESM
- `@anthropic-ai/sdk@latest` — the decision-making LLM
- `dotenv@^16.4.5` — local `.env` loading for dev convenience
- Dev: `typescript@^5.5.4`, `tsx@^4.16.2`, `@types/node@^20.14.10`
- **Assumption flagged per ruleset rule 9 ("new packages verified once, then trusted")**:
  `latest` tags were used instead of pinned versions because this session couldn't run
  `npm install` to resolve real version numbers. Run `npm install` once on your own machine,
  then commit the generated lockfile so later sessions build against a pinned, known-good set.

**Env vars required:**
- `ANTHROPIC_API_KEY` (required to run anything)
- `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-5`)
- `BITGET_API_KEY` / `BITGET_SECRET_KEY` / `BITGET_PASSPHRASE` (optional — not needed for the
  virtual-ledger architecture; only relevant if a later session deliberately adds Demo or
  live trading)
- `RISK_MAX_POSITION_USD`, `RISK_MAX_DAILY_LOSS_USD`, `RISK_MAX_DRAWDOWN_PCT`,
  `RISK_SYMBOL_WHITELIST`, `LEDGER_STARTING_CASH_USD` (all optional, sane defaults in `config.ts`)

**API endpoints live:** None (no server in this project — it's a scheduled script + a static
dashboard).

**Known stubs/mocks/TODOs:**
- No sub-theme "sense" data source wired in yet — `runOnce()`'s `extraContext` is empty
  until Session 2.
- `src/bitget/client.ts` only implements `getTicker` (the one confirmed action). Candles,
  order book, and funding rate are needed for several sub-themes and are NOT yet written —
  do this only after `npm run discover` confirms the real action names.
- Ledger is single-position-per-symbol (no scaling in/out) — fine for a first pass, flag if
  a chosen sub-theme needs partial fills.
- No automated test suite yet. The SDK ships a `MockServer` under
  `@bitget-ai/bitget-agent-sdk/testing` for exactly this — worth wiring in a Session where
  time allows, not required for the demo.
- Dashboard design: functional only (dark theme, system font, no brand/logo work). The
  ruleset's full 8-step UI/brand design process (Section 8) was **deliberately skipped this
  session** given the 3-day deadline — flagging this as a conscious scope decision, not an
  oversight. No style-history entry logged as a result. Revisit only if judging feedback or
  spare time in the final day makes it worth the cost.

**Assumptions carried into next session:**
1. **Sub-theme is not yet chosen** — the pitch above (weekend-drift, Event-Driven leaning)
   is a recommendation, not a decision. Needs explicit confirmation before Session 2 builds
   the sense-layer and system prompt around it.
2. **rToken category/field names in `src/bitget/client.ts` are unverified** — `npm run
   discover` must be run (with network, after `npm install`) before Session 2 trusts them.
3. Paper-trading architecture (virtual ledger) is the chosen default per the build
   reference's own recommendation — not re-litigated here, but reversible if `discover`
   reveals the Demo sandbox does support rTokens after all.
4. Model default is `claude-sonnet-5` (current Anthropic API model ID, verified live this
   session) — swap to `claude-opus-5` in `.env` if decision quality needs it and latency is
   acceptable for the cadence chosen.
5. Scheduling (cron or equivalent) has **not** been started yet — every day this waits is a
   day removed from the "actually run during the competition period" log. This is the single
   highest-priority action once Session 2's sub-theme logic is wired in.

**Style history:** none — see "Known stubs/TODOs" above for why.

---

## Decisions confirmed (were open, resolved before Session 2)
1. **Sub-theme: Event-Driven Agent**, on the weekend-drift thesis. Confirmed by the user.
2. **Virtual-ledger paper-trading architecture: kept as built.** Confirmed by the user — no
   Bitget Demo API or live Agentic account OAuth this session.

**Process note:** Session 2 was also run in this same chat rather than a fresh one, for the
same reason Session 0+1 were combined — the 3-day deadline doesn't leave slack for the
context-reset overhead the ruleset's "one session = one fresh chat" rule is designed to
absorb, and the user continued in-thread rather than asking for a fresh start. Flagging this
explicitly (again) rather than silently drifting from the stated process. If a Session 3 is
needed with more runway before the deadline, prefer a fresh chat with this file + the latest
zip pasted in, per the ruleset's own pre-flight checklist.

---

## Session 2: Event-Driven Agent (weekend rToken drift)
**Date:** 2026-09-18
**Goal:** Wire the confirmed sub-theme's "sense" layer into the Session 1 core, without
modifying `runOnce.ts`'s theme-agnostic loop itself.

**Files added:**
- `src/theme/time.ts` — shared weekend-window helpers
- `src/theme/eventDriven.ts` — weekend reference-price capture/persistence, keyless Fear &
  Greed fetch, the manually-verified FOMC macro note, `buildEventDrivenContext()`, and
  `EVENT_DRIVEN_SYSTEM_PROMPT`
- `scripts/run-event-driven.ts` — the sub-theme's actual entry point (this is what gets
  cron-scheduled, not `scripts/run.ts`)

**Files changed:**
- `src/risk/riskGate.ts` — `isWeekend` moved to `src/theme/time.ts` and imported, instead of
  being duplicated locally (no behavior change)
- `src/logging/decisionLog.ts`, `src/loop/runOnce.ts` — added an optional `themeContext`
  field so the exact sense-layer text shown to the LLM is logged alongside its reasoning,
  not just the reasoning itself. Motivated directly by this track's 50%-judge criterion on
  decision explainability — worth having even though it touches Session 1 files.
- `dashboard/index.html` — expandable cycle rows now show the sense-layer context above the
  LLM's reasoning when present
- `package.json` — added `start:event` / `start:event:dry` scripts
- `README.md` — Session 2 section with what was added and the known reference-price caveat

**Current full file tree:**
```
.
├── .env.example
├── .gitignore
├── README.md
├── SESSION_REPORT.md
├── package.json
├── tsconfig.json
├── dashboard/
│   └── index.html
├── logs/
│   └── .gitkeep
├── scripts/
│   ├── discover.ts
│   ├── run.ts
│   └── run-event-driven.ts
└── src/
    ├── config.ts
    ├── bitget/client.ts
    ├── decision/llmClient.ts
    ├── decision/tools.ts
    ├── ledger/virtualLedger.ts
    ├── logging/decisionLog.ts
    ├── loop/runOnce.ts
    ├── risk/riskGate.ts
    └── theme/
        ├── time.ts
        └── eventDriven.ts
```

**Dependencies installed:** none new — `eventDriven.ts` uses Node's built-in global `fetch`
(confirmed this session: `@types/node` ^18+ declares it without needing `"dom"` in
`tsconfig.json`'s `lib`, so no new package or config change needed for this to typecheck
once `npm install` actually runs).

**Env vars required:** unchanged from Session 1. No key needed for the Fear & Greed source.

**Known stubs/mocks/TODOs (new this session):**
- Weekend reference-price capture is an approximation (first ticker read after Friday
  20:00 UTC), not a verified real closing print — see README "Known limitation".
- `MACRO_CONTEXT_NOTE` in `src/theme/eventDriven.ts` is a **manually maintained string**,
  not a live feed — verified against the Fed's own Sept 16 transcript plus four corroborating
  outlets as of 2026-09-18, but it will go stale. A live no-key news source is a reasonable
  Session 3 addition if time allows.
- Still zero minutes of this actually running — nothing has been scheduled yet (see
  "Assumptions carried into next session" #5 from Session 1, still true).

**Assumptions carried into next session:**
- Everything from Session 1's list still applies, especially #2 (rToken category/field
  names unverified — `npm run discover` still hasn't been run with real network access) and
  #5 (scheduling hasn't started).
- The weekend drift window definition (`isWeekendDriftWindow` in `src/theme/time.ts`) is a
  UTC approximation of the US market close/open boundary and ignores DST — acceptable for
  this build, called out explicitly in case results near the edges look off.

**Style history:** none — dashboard change this session was additive (one new text block in
an existing expandable row), not a new design pass.

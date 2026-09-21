# Bitget Agentic Trading — Session 1 (Core Infrastructure)

Built for **Bitget AI Base Camp Hackathon S2 — Agentic Trading track**
(submission deadline: **Sept 21, 2026, UTC+8**).

This is the theme-agnostic core: a scheduled Node/TypeScript agent that reads live Bitget
market data, asks an LLM to propose exactly one trade per cycle, runs that proposal through
a separate rule-based risk gate, and logs everything (reasoning included) to a paper-trading
ledger. The sub-theme-specific "sense" layer (sentiment, macro calendar, weekend-drift stats,
etc.) plugs into `runOnce()`'s `extraContext` — that's Session 2.

## Why this architecture

- **Paper-trading approach: self-built virtual ledger, marked to live prices** — not
  Bitget's Demo sandbox, not a live Agentic account. Chosen because rToken support in
  Bitget's Demo environment is unconfirmed, and because a live account needs a deliberate
  OAuth + real-funds step this project isn't taking during the build window. See
  `src/ledger/virtualLedger.ts`.
- **The LLM proposes, it never executes.** `src/risk/riskGate.ts` is a plain rule-based
  checker (symbol whitelist, position size, drawdown circuit breaker, daily loss limit,
  weekend order-type restriction) that is the only thing allowed to turn a proposal into a
  ledger action. This is directly what the track is judged on ("risk control layer
  effectiveness", "Agent architecture quality") — keep it non-LLM.
- **Every cycle is logged with full reasoning**, not just the P&L (`src/logging/decisionLog.ts`
  → `logs/decision-log.jsonl`). Decision explainability is 50% of this track's score.

## ⚠️ This container has no network access — you must run this locally

This project was scaffolded and syntax-checked inside a sandboxed session with no internet
access, so nothing here has actually talked to Bitget or Anthropic yet. Before anything else:

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
npm run discover        # confirms the real market-data contract — see below
```

**Run `npm run discover` first, always.** `src/bitget/client.ts` only assumes ONE thing
about Bitget's API surface as confirmed (the `market.tickers` action, straight from the
SDK's own README example). Three things are flagged **NOT YET VERIFIED** at the top of that
file and must be checked with your own eyes in the `discover` output before you build
Session 2 logic on top of it:

1. The exact `category` rTokens are listed under (assumed `"SPOT"`, e.g. `rNVDAUSDT`)
2. The field name for last price in the tickers payload (code guesses `lastPr` / `last` / `close`)
3. Whether a weekend-tradable / `isReality` flag is exposed through this tool at all, or
   only via the SDK's `raw` escape hatch to a specific UTA v3 endpoint

Do not skip this. Silently trusting an unverified assumption here is exactly what the build
ruleset's anti-hallucination rules exist to prevent — a wrong `category` or field name fails
silently (empty prices, not an error) and would quietly corrupt every cycle after it.

## Quick start (after `npm run discover` confirms the assumptions above)

```bash
npm run start:dry     # one cycle, no ledger writes — sanity-check the loop end to end
npm run start          # one real cycle — proposes, risk-gates, and (if approved) fills into logs/ledger-state.json
npm run dashboard      # serves the repo; open http://localhost:3000/dashboard/
```

## Scheduling (this is what actually produces your paper-trading log)

This container can't run a persistent process, and the hackathon needs a log that was
"actually run during the competition period." Schedule `npm run start` yourself, e.g. cron:

```
*/15 * * * * cd /path/to/this/repo && /usr/bin/npm run start >> logs/cron.log 2>&1
```

Every 15 minutes is a reasonable starting cadence — tune it once you see real API rate limits
in the `discover` output. Given today's date, an honest paper-trading window is whatever you
actually run between now and the Sept 21 deadline — report that real, shorter number in the
submission rather than implying the full "≥2 weeks" recommendation was met.

## Project layout

```
src/
  config.ts            env loading, risk-gate + ledger defaults
  bitget/client.ts      @bitget-ai/bitget-agent-sdk wrapper (market data only, no key needed)
  ledger/virtualLedger.ts  paper positions, fills, equity curve, drawdown tracking
  risk/riskGate.ts      the non-LLM approve/veto layer
  decision/llmClient.ts  Anthropic Messages API wrapper
  decision/tools.ts     the JSON contract the LLM must respond in
  logging/decisionLog.ts  append-only JSONL decision log
  loop/runOnce.ts       one full cycle — theme-agnostic; Session 2 injects sub-theme data here
scripts/
  discover.ts           run this FIRST — prints Bitget's real market-data schema
  run.ts                CLI entry point (--dry for a no-write sanity check)
dashboard/index.html    reads logs/decision-log.jsonl, shows equity curve + reasoning per cycle
logs/                   decision-log.jsonl + ledger-state.json land here (gitignored)
```

## Session 2 — Event-Driven Agent (weekend rToken drift)

Sub-theme confirmed: **Event-Driven Agent**, on the thesis that rTokens trade 24/7 while
NYSE/NASDAQ don't, so Friday-close → Monday-open price movement is pure Bitget order flow,
not a live matched market. Run it with:

```bash
npm run start:event:dry   # sanity-check, no ledger writes
npm run start:event        # real cycle — schedule this one via cron (see above), not start:dry
```

What this adds, without touching Session 1's theme-agnostic `runOnce.ts`:

- `src/theme/time.ts` — shared weekend-window helpers (`isWeekend` used by the risk gate,
  `isWeekendDriftWindow` / `mostRecentFridayLabel` used by the theme layer)
- `src/theme/eventDriven.ts` — captures each symbol's price as a fixed reference the first
  cycle that runs after Friday close (`logs/weekend-reference.json`), measures drift off it
  on every later cycle, pulls a keyless crypto Fear & Greed reading
  ([api.alternative.me/fng](https://alternative.me/crypto/fear-and-greed-index/)) as a
  sentiment backdrop, and appends a manually-verified macro note (the Sept 16, 2026 FOMC
  hike — see the note's own comment for sourcing and a freshness caveat)
- `scripts/run-event-driven.ts` — the actual entry point to schedule; wraps `runOnce()`
  with this sub-theme's context and system prompt
- The decision log and dashboard now also show the exact sense-layer text the LLM saw each
  cycle, not just its reasoning — judges scoring "decision explainability" can see both

**Known limitation, flagged honestly:** the weekend-reference capture takes whatever price
the ticker returns at the first cycle after Friday 20:00 UTC — it's an approximation of the
real NYSE/NASDAQ closing print, not a verified daily-close field (see `npm run discover`
note above). Good enough for a first pass; tighten if `discover` turns up something better.

**Still open before this is submission-ready:**
- The X promotional post (`#BitgetHackathon` `@Bitget_AI`) — required for a valid submission
- Filling in the Google Form's six-part Project Description, "Role of the LLM" field, and
  Submission Materials Link once there's a real decision log to point to
- Actually scheduling `npm run start:event` to run — nothing above happens until you do

## Sources this was built against

- github.com/Bitget-AI/agent_hub, github.com/Bitget-AI/agent-sdk (checked live, 2026-09-18)
- The hackathon's official S2 rules doc and the accompanying `agentic-trading-build-reference.md`
  supplied for this project
- federalreserve.gov FOMC calendar (Sept 15–16, 2026 meeting, already resolved by the time
  this was built — see SESSION_REPORT.md)

/**
 * Session 2 entry point — Event-Driven Agent (weekend rToken drift thesis).
 * Wraps the theme-agnostic runOnce() from Session 1 without modifying its core loop:
 * fetches current prices once here to compute drift + build the sense-layer context,
 * then hands off to runOnce() with that context and this sub-theme's system prompt.
 *
 * A price is fetched here AND again inside runOnce() (for its own ledger mark-to-market) —
 * a small duplicated call, traded for keeping runOnce.ts untouched and theme-agnostic.
 * Revisit if API rate limits (see `npm run discover` output) make this worth optimizing.
 */
import { loadAppConfig } from "../src/config.js";
import { initBitget, getTicker } from "../src/bitget/client.js";
import { runOnce } from "../src/loop/runOnce.js";
import {
  getOrCaptureWeekendReference,
  buildEventDrivenContext,
  EVENT_DRIVEN_SYSTEM_PROMPT,
} from "../src/theme/eventDriven.js";

const dryRun = process.argv.includes("--dry");

const cfg = loadAppConfig();
const bitget = initBitget(cfg);

const currentPrices: Record<string, number> = {};
for (const symbol of cfg.risk.symbolWhitelist) {
  const res = await getTicker(bitget, symbol);
  if (res.ok) {
    // Same NOT-YET-VERIFIED field-name assumption as src/loop/runOnce.ts — see
    // src/bitget/client.ts header. Confirm with `npm run discover` before trusting this.
    const data = res.data as any;
    const row = Array.isArray(data) ? data[0] : data;
    const lastPrice = row?.lastPr ?? row?.last ?? row?.close;
    if (lastPrice) currentPrices[symbol] = Number(lastPrice);
  }
}

const weekendRef = await getOrCaptureWeekendReference(cfg.risk.symbolWhitelist, currentPrices);
const extraContext = await buildEventDrivenContext(cfg.risk.symbolWhitelist, currentPrices, weekendRef);

runOnce({ dryRun, extraContext, systemPromptOverride: EVENT_DRIVEN_SYSTEM_PROMPT })
  .then((result) => {
    const equity = result.ledgerSnapshot.equityCurve.at(-1)?.equity;
    console.log(
      `[${result.cycleId}] action=${result.proposal.action} symbol=${result.proposal.symbol} ` +
        `approved=${result.verdict.approved}${dryRun ? " (dry run — no ledger change)" : ""}`,
    );
    console.log(`  verdict: ${result.verdict.reason}`);
    console.log(`  equity: $${equity?.toFixed ? equity.toFixed(2) : equity}`);
  })
  .catch((err) => {
    console.error("Cycle failed:", err);
    process.exitCode = 1;
  });

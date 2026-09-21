/**
 * Run this FIRST, before writing any Session 2 logic on top of src/bitget/client.ts.
 * It needs network access (this container's bash tool does not have it — run this on
 * your own machine after `npm install`). No Bitget credentials required.
 *
 *   npm install
 *   npm run discover
 *
 * Read the printed schema and confirm (or correct) the assumptions flagged at the top of
 * src/bitget/client.ts — the exact `category` for rTokens, the field name for last price,
 * and whether a weekend-tradable flag is exposed here at all.
 */
import { loadAppConfig } from "../src/config.js";
import { initBitget, discoverMarketSurface } from "../src/bitget/client.js";

const cfg = loadAppConfig();
const handle = initBitget(cfg);

const { domains, marketSchema, tickersAction } = await discoverMarketSurface(handle);

console.log("=== discover() — domains + tool counts ===");
console.log(JSON.stringify(domains, null, 2));
console.log("\n=== discover({ tool: 'market' }) — full schema ===");
console.log(JSON.stringify(marketSchema, null, 2));
console.log("\n=== discover({ tool: 'market', action: 'tickers' }) — exact contract ===");
console.log(JSON.stringify(tickersAction, null, 2));

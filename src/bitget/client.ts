/**
 * Thin wrapper around @bitget-ai/bitget-agent-sdk's public `market` intent tool.
 *
 * VERIFIED against the SDK's own README (github.com/Bitget-AI/agent-sdk, checked 2026-09-18):
 *   - loadConfig / buildTools / BitgetRestClient / safeInvoke are the documented entry points.
 *   - `market.tickers` with { category, symbol } is a confirmed working action (it's the
 *     SDK's own quick-start example).
 *
 * NOT YET VERIFIED — flagged per the build ruleset's anti-hallucination rule. Run
 * `npm run discover` (needs network + no credentials) before trusting these in the
 * decision loop, then update this comment with what actually comes back:
 *   - exact `action` names for candles / order book / funding rate / open interest
 *     (this file only calls the one confirmed action, "tickers")
 *   - the `category` value rTokens are listed under (assumed "SPOT" — Bitget's own listing
 *     announcements describe rTokens like rNVDA/rTSLA as spot assets, e.g. rNVDAUSDT — but
 *     this is not yet confirmed against a live `discover` response from this SDK)
 *   - whether rToken instruments expose a weekend-tradable / isReality flag through this
 *     tool at all, or only via a raw UTA v3 endpoint reachable through the SDK's `raw`
 *     escape hatch
 */
import {
  loadConfig,
  buildTools,
  BitgetRestClient,
  safeInvoke,
  type ToolSpec,
  type ToolContext,
} from "@bitget-ai/bitget-agent-sdk";
import type { AppConfig } from "../config.js";

export interface BitgetHandle {
  ctx: ToolContext;
  tools: ToolSpec[];
  market: ToolSpec;
  discoverTool: ToolSpec;
}

export function initBitget(cfg: AppConfig): BitgetHandle {
  const config = loadConfig({
    modules: "market", // read-only public data only — no trade/account module loaded in Session 1
    readOnly: cfg.bitget.readOnly,
    apiKey: cfg.bitget.apiKey,
    secretKey: cfg.bitget.secretKey,
    passphrase: cfg.bitget.passphrase,
  });
  const client = new BitgetRestClient(config);
  const tools = buildTools(config);
  const ctx: ToolContext = { config, client };

  const market = tools.find((t) => t.name === "market");
  const discoverTool = tools.find((t) => t.name === "discover");
  if (!market || !discoverTool) {
    throw new Error(
      "Expected 'market' and 'discover' tools from buildTools() — the SDK surface may " +
        "have changed since this file was written. Re-check github.com/Bitget-AI/agent-sdk.",
    );
  }
  return { ctx, tools, market, discoverTool };
}

/** Confirmed working: current ticker (last price, bid/ask, 24h stats) for one symbol. */
export async function getTicker(
  handle: BitgetHandle,
  symbol: string,
  category: "SPOT" | "USDT-FUTURES" = "SPOT",
) {
  return safeInvoke(handle.market, { action: "tickers", category, symbol }, handle.ctx);
}

/**
 * Runs the SDK's own `discover` tool and returns the raw payload so you can see the real
 * action list / schema for `market` before writing more call sites against assumptions.
 * This is Session 1's designated "verify once" step — see scripts/discover.ts.
 */
export async function discoverMarketSurface(handle: BitgetHandle) {
  const domains = await safeInvoke(handle.discoverTool, {}, handle.ctx);
  const marketSchema = await safeInvoke(handle.discoverTool, { tool: "market" }, handle.ctx);
  const tickersAction = await safeInvoke(
    handle.discoverTool,
    { tool: "market", action: "tickers" },
    handle.ctx,
  );
  return { domains, marketSchema, tickersAction };
}

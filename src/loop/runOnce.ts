import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { loadAppConfig } from "../config.js";
import { initBitget, getTicker } from "../bitget/client.js";
import { initAnthropic, decide } from "../decision/llmClient.js";
import { DECISION_JSON_INSTRUCTIONS, parseDecision } from "../decision/tools.js";
import { evaluateTrade, checkPositionSize } from "../risk/riskGate.js";
import { VirtualLedger, type VirtualLedgerJSON } from "../ledger/virtualLedger.js";
import { appendDecision } from "../logging/decisionLog.js";

const LEDGER_STATE_PATH = "logs/ledger-state.json";

// Each `npm run start` invocation is a fresh process (this is meant to be cron-scheduled —
// see README "Scheduling"), so ledger state is persisted to disk between runs rather than
// kept in memory. This is the one piece of state Session 1 owns end-to-end.
async function loadLedger(startingCashUsd: number): Promise<VirtualLedger> {
  try {
    const raw = await readFile(LEDGER_STATE_PATH, "utf8");
    return VirtualLedger.fromJSON(JSON.parse(raw) as VirtualLedgerJSON);
  } catch {
    return new VirtualLedger(startingCashUsd);
  }
}

async function saveLedger(ledger: VirtualLedger): Promise<void> {
  await mkdir(dirname(LEDGER_STATE_PATH), { recursive: true });
  await writeFile(LEDGER_STATE_PATH, JSON.stringify(ledger.toJSON(), null, 2), "utf8");
}

export interface RunOnceOptions {
  dryRun: boolean;
  /** Session 2 injects the theme-specific "sense" data here (sentiment, macro calendar, weekend-drift stats, earnings, etc). */
  extraContext?: string;
  systemPromptOverride?: string;
}

const DEFAULT_SYSTEM_PROMPT = `
You are the decision-making core of a paper-trading agent for tokenized US stocks (rTokens)
and crypto on Bitget. You do NOT execute trades yourself — you only propose one action per
cycle. A separate, non-LLM risk gate approves or vetoes your proposal; assume it will reject
anything outside the stated symbol whitelist, outside position-size limits, or that uses a
market order on a weekend (only limit and TP/SL orders trade on rToken weekends).
${DECISION_JSON_INSTRUCTIONS}
`.trim();

export async function runOnce(opts: RunOnceOptions) {
  const cfg = loadAppConfig();
  const bitget = initBitget(cfg);
  const anthropic = initAnthropic(cfg);
  const ledger = await loadLedger(cfg.ledger.startingCashUsd);

  const cycleId = randomUUID();
  const timestamp = new Date().toISOString();

  const prices: Record<string, number> = {};
  const tickerResults: Record<string, unknown> = {};
  for (const symbol of cfg.risk.symbolWhitelist) {
    const res = await getTicker(bitget, symbol);
    tickerResults[symbol] = res;
    if (res.ok) {
      // NOT YET VERIFIED: exact field name for last price in the tickers payload — confirm
      // with `npm run discover` and adjust this line. See src/bitget/client.ts header.
      const data = res.data as any;
      const row = Array.isArray(data) ? data[0] : data;
      const lastPrice = row?.lastPr ?? row?.last ?? row?.close;
      if (lastPrice) prices[symbol] = Number(lastPrice);
    }
  }

  const marketSnapshot = { timestamp, prices, raw: tickerResults };
  const equity = ledger.markToMarket(prices, timestamp);

  const contextParts = [
    `Cycle: ${cycleId} at ${timestamp}`,
    `Symbol whitelist: ${cfg.risk.symbolWhitelist.join(", ")}`,
    `Current prices: ${JSON.stringify(prices)}`,
    `Ledger equity: $${equity.equity.toFixed(2)} (cash $${equity.cash.toFixed(2)}, unrealized $${equity.unrealizedPnl.toFixed(2)})`,
    `Open positions: ${JSON.stringify(ledger.snapshot().openPositions)}`,
  ];
  if (opts.extraContext) contextParts.push(opts.extraContext);

  const { text } = await decide(
    anthropic,
    cfg.anthropicModel,
    opts.systemPromptOverride ?? DEFAULT_SYSTEM_PROMPT,
    contextParts.join("\n\n"),
  );

  let proposal;
  try {
    proposal = parseDecision(text);
  } catch (err) {
    await appendDecision({
      cycleId,
      timestamp,
      marketSnapshot,
      themeContext: opts.extraContext,
      llmReasoning: text,
      proposedTrade: null,
      riskVerdict: { approved: false, reason: String(err) },
      executedTrade: null,
      ledgerSnapshot: ledger.snapshot(),
    });
    throw err;
  }

  let verdict = evaluateTrade(proposal, cfg, ledger);
  if (verdict.approved && proposal.action === "open" && proposal.qty) {
    const price = prices[proposal.symbol];
    const sizeCheck = checkPositionSize(proposal.qty, price, cfg);
    if (!sizeCheck.approved) verdict = sizeCheck;
  }

  let executedTrade: unknown = null;
  if (!opts.dryRun && verdict.approved) {
    if (proposal.action === "open" && proposal.side && proposal.qty) {
      executedTrade = ledger.open(proposal.symbol, proposal.side, proposal.qty, prices[proposal.symbol]);
    } else if (proposal.action === "close") {
      executedTrade = ledger.close(proposal.symbol, prices[proposal.symbol]);
    }
  }

  await appendDecision({
    cycleId,
    timestamp,
    marketSnapshot,
    themeContext: opts.extraContext,
    llmReasoning: proposal.reasoning,
    proposedTrade: proposal,
    riskVerdict: verdict,
    executedTrade,
    ledgerSnapshot: ledger.snapshot(),
  });

  if (!opts.dryRun) await saveLedger(ledger);

  return { cycleId, proposal, verdict, executedTrade, ledgerSnapshot: ledger.snapshot() };
}

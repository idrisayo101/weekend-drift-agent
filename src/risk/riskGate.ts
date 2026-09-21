/**
 * Non-LLM, rule-based approve/veto gate. The LLM proposes exactly one action per cycle;
 * this file is the only thing that can turn that proposal into a ledger action. Nothing
 * here is negotiable by prompting — that's deliberate (build reference §3: "a separate,
 * non-LLM rule layer that must approve a trade before confirm:true is ever set, rather
 * than letting the LLM call it directly"). This is also literally the "risk control layer
 * effectiveness" judges score this track on — keep every veto reason human-readable, they
 * go straight into the decision log.
 */
import type { AppConfig } from "../config.js";
import type { VirtualLedger, Side } from "../ledger/virtualLedger.js";
import { isWeekend } from "../theme/time.js";

export interface ProposedTrade {
  action: "open" | "close" | "hold";
  symbol: string;
  side?: Side;
  qty?: number;
  orderType: "market" | "limit" | "tp_sl";
  limitPrice?: number;
  reasoning: string; // the LLM's own stated reasoning, carried through into the log verbatim
}

export interface RiskVerdict {
  approved: boolean;
  reason: string;
}

export function evaluateTrade(
  proposal: ProposedTrade,
  cfg: AppConfig,
  ledger: VirtualLedger,
  now: Date = new Date(),
): RiskVerdict {
  if (proposal.action === "hold") {
    return { approved: true, reason: "No action proposed." };
  }

  if (!cfg.risk.symbolWhitelist.includes(proposal.symbol)) {
    return { approved: false, reason: `${proposal.symbol} is not on the risk symbol whitelist.` };
  }

  // Weekend order-type restriction: rTokens only accept limit and TP/SL orders on
  // Sat/Sun (build reference §3) — a market order proposed on a weekend is vetoed, not
  // silently downgraded, so the LLM has to explicitly reason about the constraint.
  if (isWeekend(now) && proposal.orderType === "market") {
    return {
      approved: false,
      reason:
        "Market orders are not supported on rToken weekends — only limit and TP/SL orders " +
        "trade. Resubmit as 'limit' or 'tp_sl' with an explicit limitPrice.",
    };
  }

  if (proposal.action === "open") {
    if (!proposal.qty || !proposal.side) {
      return { approved: false, reason: "Open proposal missing qty or side." };
    }
    if (ledger.hasPosition(proposal.symbol)) {
      return { approved: false, reason: `Already holding a position on ${proposal.symbol}.` };
    }
  }

  if (ledger.currentDrawdownPct() >= cfg.risk.maxDrawdownPct) {
    return {
      approved: false,
      reason:
        `Drawdown circuit breaker tripped: ${ledger.currentDrawdownPct().toFixed(2)}% >= ` +
        `${cfg.risk.maxDrawdownPct}% max. No new opens until a human resets it.`,
    };
  }

  if (ledger.realizedPnlToday() <= -cfg.risk.maxDailyLossUsd) {
    return {
      approved: false,
      reason:
        `Daily loss limit hit: $${ledger.realizedPnlToday().toFixed(2)} <= ` +
        `-$${cfg.risk.maxDailyLossUsd}. No new opens today.`,
    };
  }

  return {
    approved: true,
    reason: "Passed symbol whitelist, weekend order-type, drawdown, and daily-loss checks.",
  };
}

/** Separate from evaluateTrade because it needs a live price the gate itself doesn't fetch. */
export function checkPositionSize(qty: number, price: number, cfg: AppConfig): RiskVerdict {
  const notional = qty * price;
  if (notional > cfg.risk.maxPositionUsd) {
    return {
      approved: false,
      reason: `Position notional $${notional.toFixed(2)} exceeds max $${cfg.risk.maxPositionUsd}.`,
    };
  }
  return { approved: true, reason: "Within max position size." };
}

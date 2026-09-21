import type { ProposedTrade } from "../risk/riskGate.js";

export const DECISION_JSON_INSTRUCTIONS = `
Respond with ONLY a single JSON object, no prose outside it, matching exactly this shape:
{
  "reasoning": string,        // your full reasoning — this is logged and scored on explainability, be specific about what data drove this decision
  "action": "open" | "close" | "hold",
  "symbol": string,           // must be one of the symbols listed in the prompt's whitelist
  "side": "long" | "short" | null,
  "qty": number | null,
  "orderType": "market" | "limit" | "tp_sl",
  "limitPrice": number | null
}
`.trim();

export function parseDecision(raw: string): ProposedTrade {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Model did not return parseable JSON. Raw output:\n${raw}`);
  }
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    action: parsed.action,
    symbol: parsed.symbol,
    side: parsed.side ?? undefined,
    qty: parsed.qty ?? undefined,
    orderType: parsed.orderType ?? "limit",
    limitPrice: parsed.limitPrice ?? undefined,
    reasoning: parsed.reasoning ?? "",
  };
}

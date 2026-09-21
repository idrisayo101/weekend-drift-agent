/**
 * Session 2 — Event-Driven Agent sub-theme: the weekend rToken drift thesis.
 *
 * Thesis (from SESSION_REPORT.md Session 0): rTokens trade 24/7 while NYSE/NASDAQ do not,
 * so from Friday's close to Monday's open, price movement is driven purely by Bitget's own
 * order flow, not a live matched market price. This module (a) captures each symbol's price
 * as a "reference" the first cycle that runs after Friday close, (b) measures drift off that
 * reference on every later cycle through the weekend, and (c) adds a macro/sentiment backdrop
 * so the LLM isn't deciding on price alone.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isWeekendDriftWindow, mostRecentFridayLabel } from "./time.js";
import { DECISION_JSON_INSTRUCTIONS } from "../decision/tools.js";

const REFERENCE_STATE_PATH = "logs/weekend-reference.json";

interface WeekendReferenceState {
  fridayLabel: string;
  prices: Record<string, number>;
  capturedAt: string;
}

interface WeekendReference {
  fridayLabel: string;
  referencePrices: Record<string, number>;
}

async function loadReferenceState(): Promise<WeekendReferenceState | null> {
  try {
    const raw = await readFile(REFERENCE_STATE_PATH, "utf8");
    return JSON.parse(raw) as WeekendReferenceState;
  } catch {
    return null;
  }
}

async function saveReferenceState(state: WeekendReferenceState): Promise<void> {
  await mkdir(dirname(REFERENCE_STATE_PATH), { recursive: true });
  await writeFile(REFERENCE_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Captures each whitelisted symbol's price the first cycle that runs after Friday's close
 * and holds it fixed for the rest of that weekend — the reference the drift is measured
 * against (build reference doc §3).
 *
 * NOT YET VERIFIED: this captures whatever the ticker returns at first-run-after-Friday-
 * 20:00-UTC, which approximates but does not guarantee the exact NYSE/NASDAQ closing print.
 * Tighten once `npm run discover` confirms whether a real daily-close field exists on the
 * ticker/candle payload — see src/bitget/client.ts header.
 */
export async function getOrCaptureWeekendReference(
  symbols: string[],
  currentPrices: Record<string, number>,
  now: Date = new Date(),
): Promise<WeekendReference | null> {
  if (!isWeekendDriftWindow(now)) return null;

  const label = mostRecentFridayLabel(now);
  const existing = await loadReferenceState();

  if (existing && existing.fridayLabel === label) {
    const missing = symbols.filter((s) => !(s in existing.prices) && currentPrices[s] !== undefined);
    if (missing.length > 0) {
      for (const s of missing) existing.prices[s] = currentPrices[s];
      await saveReferenceState(existing);
    }
    return { fridayLabel: label, referencePrices: existing.prices };
  }

  const prices: Record<string, number> = {};
  for (const s of symbols) if (currentPrices[s] !== undefined) prices[s] = currentPrices[s];
  const state: WeekendReferenceState = { fridayLabel: label, prices, capturedAt: now.toISOString() };
  await saveReferenceState(state);
  return { fridayLabel: label, referencePrices: prices };
}

export interface FearGreedReading {
  value: number;
  classification: string;
  timestamp: string;
}

/**
 * Public, keyless: api.alternative.me/fng/ — crypto-wide sentiment. Used as a general
 * risk-appetite backdrop: rTokens trade on a crypto-native exchange during exactly the
 * weekend window this sub-theme watches, so crypto risk sentiment is a reasonable proxy
 * even though the instruments themselves track equities.
 */
export async function getFearGreedIndex(): Promise<FearGreedReading | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const json: any = await res.json();
    const row = json?.data?.[0];
    if (!row) return null;
    return {
      value: Number(row.value),
      classification: row.value_classification,
      timestamp: new Date(Number(row.timestamp) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Manually maintained, not fetched live — verified against the Federal Reserve's own
 * Sept 16, 2026 press-conference transcript plus corroborating reporting (Fox Business,
 * The Motley Fool, InvestmentNews, Kiplinger), checked 2026-09-18. Update this by hand if
 * you're running the agent more than a few days past that check, or wire in a real no-key
 * news source later (bitget-signal's news-briefing skill covers this IF you confirm it's
 * callable outside an interactive AI client — unverified, see build reference doc §6).
 */
export const MACRO_CONTEXT_NOTE =
  "Most recent major macro event: FOMC on Sept 16, 2026 (Chair Kevin Warsh) raised the " +
  "federal funds rate 25bp to 3.75%-4.00% -- unanimous 12-0 vote, the first hike since " +
  "July 2023. Initial equity reaction was mildly negative (S&P and Nasdaq eased lower, " +
  "Dow off more than 1%).";

export async function buildEventDrivenContext(
  symbols: string[],
  currentPrices: Record<string, number>,
  weekendRef: WeekendReference | null,
): Promise<string> {
  const fearGreed = await getFearGreedIndex();
  const lines: string[] = [MACRO_CONTEXT_NOTE];

  if (weekendRef) {
    lines.push(`Weekend drift reference captured for Friday ${weekendRef.fridayLabel}:`);
    for (const symbol of symbols) {
      const ref = weekendRef.referencePrices[symbol];
      const current = currentPrices[symbol];
      if (ref === undefined || current === undefined) continue;
      const driftPct = ((current - ref) / ref) * 100;
      lines.push(
        `  ${symbol}: reference $${ref.toFixed(2)} -> current $${current.toFixed(2)} ` +
          `(${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(2)}% drift -- driven by Bitget's own ` +
          `weekend order flow, since there is no live NYSE/NASDAQ print to anchor to right now).`,
      );
    }
  } else {
    lines.push(
      "Not currently in the Friday-close-to-Monday-open weekend window -- no drift reference active this cycle.",
    );
  }

  if (fearGreed) {
    lines.push(
      `Crypto Fear & Greed Index: ${fearGreed.value}/100 (${fearGreed.classification}) as of ${fearGreed.timestamp}.`,
    );
  } else {
    lines.push("Crypto Fear & Greed Index: unavailable this cycle (fetch failed).");
  }

  return lines.join("\n");
}

export const EVENT_DRIVEN_SYSTEM_PROMPT = `
You are the decision-making core of an Event-Driven paper-trading agent for tokenized US
stocks (rTokens) on Bitget. Your specific thesis: rTokens trade 24/7 while NYSE/NASDAQ do
not, so from Friday's close to Monday's open, any price movement is driven purely by
Bitget's own order flow, not a live matched market price. Each cycle, look at the current
drift off Friday's reference (if the weekend window is active), the macro event backdrop,
and the crypto sentiment reading, and decide whether the drift looks like it will FADE
(revert toward the reference by Monday) or RIDE (continue/extend into Monday) -- or whether
to do nothing this cycle.

You do NOT execute trades yourself -- you only propose one action per cycle. A separate,
non-LLM risk gate approves or vetoes your proposal; it will reject anything outside the
stated symbol whitelist, outside position-size limits, or that uses a market order on a
weekend. Always propose orderType "limit" or "tp_sl" with an explicit limitPrice when
acting during the weekend window -- market orders are vetoed outright on Sat/Sun.

${DECISION_JSON_INSTRUCTIONS}
`.trim();

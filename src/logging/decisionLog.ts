import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface DecisionLogEntry {
  cycleId: string;
  timestamp: string;
  marketSnapshot: unknown;
  /** Session 2+: whatever sub-theme "sense" data (drift %, sentiment, macro note, etc.) was fed to the LLM this cycle, alongside its reasoning — for judging on decision explainability. Empty/omitted for the theme-agnostic Session 1 loop. */
  themeContext?: string;
  llmReasoning: string;
  proposedTrade: unknown;
  riskVerdict: { approved: boolean; reason: string };
  executedTrade: unknown | null;
  ledgerSnapshot: unknown;
}

export const DECISION_LOG_PATH = "logs/decision-log.jsonl";

/**
 * Append-only JSONL log. One line per decision cycle — this is the primary evidence for
 * "decision explainability" (50% of this track's judge score), not just the ledger P&L.
 * Never overwritten; the dashboard reads it straight.
 */
export async function appendDecision(entry: DecisionLogEntry): Promise<void> {
  await mkdir(dirname(DECISION_LOG_PATH), { recursive: true });
  await appendFile(DECISION_LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}

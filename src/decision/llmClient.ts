import Anthropic from "@anthropic-ai/sdk";
import type { AppConfig } from "../config.js";

export function initAnthropic(cfg: AppConfig): Anthropic {
  return new Anthropic({ apiKey: cfg.anthropicApiKey });
}

/**
 * One decision call. `context` is everything the agent is allowed to "sense" this cycle —
 * the market snapshot, plus whatever Session 2 wires in for the chosen sub-theme
 * (sentiment readings, macro calendar, weekend-drift stats, earnings data, etc). The
 * system prompt is deliberately explicit that the LLM only PROPOSES — src/risk/riskGate.ts
 * has the only vote that counts.
 */
export async function decide(
  anthropic: Anthropic,
  model: string,
  systemPrompt: string,
  context: string,
) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: context }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return {
    raw: message,
    text: textBlock && textBlock.type === "text" ? textBlock.text : "",
  };
}

/**
 * Shared time helpers for weekend-aware logic. Deliberately UTC-based and approximate on
 * the US market close/open boundary (ignores DST shifts between EST/EDT) — good enough for
 * a 3-day hackathon build; tighten with a real timezone library if the drift window's exact
 * edges start mattering to the results.
 */

/** Sat/Sun in UTC — used by the risk gate's weekend order-type restriction. */
export function isWeekend(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

/**
 * True from ~Friday 20:00 UTC (approx. US market close) through ~Monday 14:00 UTC (approx.
 * US market open) — the window the weekend-drift thesis cares about, which is wider than
 * isWeekend() alone (it includes the Friday evening tail and Monday pre-open tail).
 */
export function isWeekendDriftWindow(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6 || day === 0) return true; // Saturday, Sunday
  if (day === 5 && hour >= 20) return true; // Friday evening, after ~4pm ET
  if (day === 1 && hour < 14) return true; // Monday morning, before ~9:30am ET
  return false;
}

/** ISO date (YYYY-MM-DD) of the most recent Friday at or before `now` — the label for "which weekend". */
export function mostRecentFridayLabel(now: Date = new Date()): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = (day - 5 + 7) % 7; // days since Friday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

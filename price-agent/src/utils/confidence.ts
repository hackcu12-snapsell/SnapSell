import { DataType, Listing } from "../types";

/**
 * Scores the confidence of a set of listings returned by an agent.
 *
 * Rules:
 * - < 3 listings → cap score at 0.4
 * - stddev/mean > 0.5 → subtract 0.2 (high price variance)
 * - data_type === "sold_price" → add 0.1 bonus (more reliable)
 */
export function scoreListingConfidence(
  listings: Listing[],
  dataType: DataType
): { score: number; explanation: string } {
  if (listings.length === 0) {
    return { score: 0.0, explanation: "No listings returned." };
  }

  let score = 0.7; // base score for having any results
  const reasons: string[] = [];

  if (listings.length < 3) {
    score = Math.min(score, 0.4);
    reasons.push(`Only ${listings.length} listing(s) — capped at 0.4.`);
  }

  const prices = listings.map((l) => l.price).filter((p) => p > 0);
  if (prices.length >= 2) {
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance =
      prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stddev = Math.sqrt(variance);
    const coefficientOfVariation = stddev / mean;

    if (coefficientOfVariation > 0.5) {
      score -= 0.2;
      reasons.push(
        `High price variance (CV=${coefficientOfVariation.toFixed(2)}) — reduced by 0.2.`
      );
    }
  }

  if (dataType === "sold_price") {
    score += 0.1;
    reasons.push("Sold price data — +0.1 bonus.");
  }

  score = Math.max(0, Math.min(1, score));
  const explanation =
    reasons.length > 0
      ? reasons.join(" ")
      : `${listings.length} listings, confidence ${score.toFixed(2)}.`;

  return { score, explanation };
}

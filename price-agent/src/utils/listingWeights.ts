import "../env";
import { ItemMetadata, Listing } from "../types";
import { callGemini } from "./gemini";

/**
 * Uses Gemini to score each listing's relevance to the item we're pricing (0–1).
 * Distinguishes same item vs same product different spec (e.g. size, set, edition) vs wrong product.
 * Returns listings with relevance_weight set; on failure returns listings unchanged.
 */
export async function scoreListingsByRelevance(
  item: ItemMetadata,
  listings: Listing[],
  sourceName: string
): Promise<Listing[]> {
  if (listings.length === 0 || !process.env.GEMINI_API_KEY) return listings;

  const itemDesc = [
    item.name,
    item.brand ? `Brand: ${item.brand}` : null,
    item.category ? `Category: ${item.category}` : null,
    item.condition ? `Condition: ${item.condition}` : null,
    item.year ? `Year: ${item.year}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = listings.map((l, i) => {
    const cond = l.condition ? ` (${l.condition})` : "";
    return `[${i}] ${l.title}${cond}`;
  });

  const prompt = `We are pricing this item:
${itemDesc}

Listings from ${sourceName} (index in brackets):
${lines.join("\n")}

Score each listing's relevance to OUR item from 0.0 to 1.0. Same order as above.
- 1.0 = Same item and spec (exact match: same set/edition/size/colorway where it matters).
- 0.5–0.9 = Same product line but different spec that affects price (e.g. different size like 7.5 vs 11, or different set like Base Set vs Celebrations, or different colorway). Weight by how much the spec typically affects price.
- 0.1–0.4 = Related but wrong variant (e.g. different year, reprint).
- 0.0 = Different product or unrelated listing.

Examples: "Charizard Base Set" when we want Base Set → 1.0; "Charizard Celebrations" when we want Base Set → 0.0. Same shoe model size 11 when we want size 7.5 → 0.6. Same shoe same size → 1.0.

Return ONLY a JSON array of numbers, one per listing, e.g. [1,0.8,0,0.6]. No other text.`;

  try {
    const raw = await callGemini(prompt, 0.1);
    let s = raw.trim();
    const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const m = s.match(codeBlock);
    if (m) s = m[1].trim();
    s = s.replace(/,(\s*[}\]])/g, "$1");
    const scores = JSON.parse(s) as number[];
    if (!Array.isArray(scores) || scores.length !== listings.length) return listings;

    return listings.map((l, i) => {
      const n = scores[i];
      const w = typeof n === "number" && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : 1;
      return { ...l, relevance_weight: w };
    });
  } catch {
    return listings;
  }
}

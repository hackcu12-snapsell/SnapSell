import "../env";
import { ItemMetadata, Listing } from "../types";
import { callGemini } from "./gemini";

/**
 * Uses Gemini to keep only listings whose title matches the item (same product/model).
 * Returns the original list if Gemini is unavailable or returns invalid data.
 */
export async function filterListingsByRelevance(
  item: ItemMetadata,
  listings: Listing[],
  sourceName: string
): Promise<Listing[]> {
  if (listings.length === 0) return listings;
  if (!process.env.GEMINI_API_KEY) return listings;

  const itemDesc = [item.name, item.brand, item.category].filter(Boolean).join(" | ");
  const lines = listings.map((l, i) => `[${i}] ${l.title}`);
  const prompt = `Item we are pricing: ${itemDesc}

Listing titles from ${sourceName} (index in brackets):
${lines.join("\n")}

Which listing indices are for the SAME product/item (correct model, not a different product)? Return a JSON array of indices to KEEP, e.g. [0,1,3]. Exclude unrelated or wrong items. Return only the array, no explanation.`;

  try {
    const raw = await callGemini(prompt, 0.05);
    let s = raw.trim();
    const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const m = s.match(codeBlock);
    if (m) s = m[1].trim();
    s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":').replace(/,(\s*[}\]])/g, "$1");
    const indices = JSON.parse(s) as number[];
    if (!Array.isArray(indices)) return listings;
    const valid = indices.filter((i) => typeof i === "number" && i >= 0 && i < listings.length);
    const seen = new Set(valid);
    return listings.filter((_, i) => seen.has(i));
  } catch {
    return listings;
  }
}

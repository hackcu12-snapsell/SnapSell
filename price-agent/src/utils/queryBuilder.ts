import { ItemMetadata } from "../types";

/**
 * Builds a clean search query string from item metadata.
 * Format: "${brand} ${name}" trimmed to maxLength.
 * Falls back to keywords if the result is too short.
 */
export function buildQuery(item: ItemMetadata, maxLength = 100): string {
  const parts = [item.brand, item.name].filter(Boolean).join(" ");
  const cleaned = parts.replace(/[^\w\s\-]/g, "").replace(/\s+/g, " ").trim();

  if (cleaned.length >= 10) {
    return cleaned.slice(0, maxLength);
  }

  // Fallback to keywords
  const fromKeywords = item.keywords.join(" ").replace(/[^\w\s\-]/g, "").trim();
  return fromKeywords.slice(0, maxLength) || item.name.slice(0, maxLength);
}

/**
 * Returns a source-specific condition filter string, or null if item.condition
 * is not set (agent should omit the filter entirely).
 */
export function buildConditionFilter(
  item: ItemMetadata,
  source: "ebay" | "etsy" | "stockx"
): string | null {
  if (!item.condition) return null;

  const normalized = item.condition.toLowerCase();

  if (source === "ebay") {
    // eBay Browse API filter format for used-condition items
    if (normalized.includes("new")) return null; // new items need no used-condition filter
    return "conditions:{USED|LIKE_NEW|VERY_GOOD|GOOD|ACCEPTABLE}";
  }

  if (source === "etsy") {
    // Etsy doesn't have a structured condition filter via API
    return null;
  }

  if (source === "stockx") {
    // StockX only sells deadstock — no condition filter needed
    return null;
  }

  return null;
}

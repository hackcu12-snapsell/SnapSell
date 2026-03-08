import { ItemMetadata } from "../types";
import { callGemini } from "./gemini";
import { buildQuery } from "./queryBuilder";

export interface AgentQueries {
  ebay: string;
  amazon: string;
  facebook: string;
  google_shopping: string;
  stockx: string;
}

function fallbackQueries(item: ItemMetadata): AgentQueries {
  const base = buildQuery(item);
  return {
    ebay: base,
    amazon: base,
    facebook: base,
    google_shopping: base,
    stockx: item.is_streetwear_or_sneakers ? base : "",  // is_streetwear_or_sneakers derived from category
  };
}

/**
 * Uses Gemini to generate a targeted search query for each marketplace.
 * Falls back to buildQuery for all sources if the API call fails.
 *
 * One Gemini call covers all sources — more efficient than per-agent calls.
 */
export async function generateAgentQueries(item: ItemMetadata): Promise<AgentQueries> {
  const itemBlock = [
    `Name: ${item.name}`,
    item.brand ? `Brand: ${item.brand}` : null,
    `Category: ${item.category}`,
    item.condition ? `Condition: ${item.condition}` : null,
    item.year ? `Year/Model Year: ${item.year}` : null,
    item.description ? `Description: ${item.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are a pricing research specialist. Generate one short search query per marketplace. Each query MUST stay under its character limit by being concise—prioritize best info, do not cut off mid-word.

ITEM:
${itemBlock}

STRICT LIMITS (stay under; truncation is applied if over):
- ebay: 80 chars max. Priority: brand, exact model, then colorway/variant, then condition. Be concise. Use relevant info from description, like size.
- amazon: 60 chars max. Brand + model only for retail ceiling.
- facebook: 50 chars max. Natural local-search phrase; brand + short model.
- google_shopping: 60 chars max. Brand + model for retail anchor.
- stockx: 80 chars max. Exact model + colorway only (e.g. "Air Jordan 1 Retro High OG Chicago"). Empty string "" if NOT sneaker/streetwear.

Return ONLY valid JSON, no other text:
{"ebay":"...","amazon":"...","facebook":"...","google_shopping":"...","stockx":"..."}`;

  try {
    const raw = await callGemini(prompt, 0.1);
    const parsed = JSON.parse(raw) as Partial<AgentQueries>;

    const base = buildQuery(item);
    const LIMITS = { ebay: 80, amazon: 60, facebook: 50, google_shopping: 60, stockx: 80 };
    const trim = (q: string, max: number) => (q ?? "").trim().slice(0, max).trim() || base;

    const queries: AgentQueries = {
      ebay: trim(parsed.ebay ?? "", LIMITS.ebay) || base,
      amazon: trim(parsed.amazon ?? "", LIMITS.amazon) || base,
      facebook: trim(parsed.facebook ?? "", LIMITS.facebook) || base,
      google_shopping: trim(parsed.google_shopping ?? "", LIMITS.google_shopping) || base,
      stockx: (parsed.stockx ?? "").trim().slice(0, LIMITS.stockx).trim(),
    };

    return queries;
  } catch (err) {
    console.warn(
      "[queryGenerator] Gemini query generation failed, using fallback:",
      err instanceof Error ? err.message : String(err)
    );
    return fallbackQueries(item);
  }
}

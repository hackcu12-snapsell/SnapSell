import "../env";
import { AgentResult, ItemMetadata, PriceAgentOutput, PurchaseRecommendation, RECOMMENDATION_THRESHOLDS } from "../types";
import { callGemini } from "../utils/gemini";

export interface SynthesisResult {
  value_low: number | null;
  value_mid: number | null;
  value_high: number | null;
  value_confidence: number | null;
  volume_score: number | null;
  reasonings: string;
  caveats: string | null;
  recommendation: PurchaseRecommendation;
  recommendation_reasoning: string;
}

// ─── Prompt building ──────────────────────────────────────────────────────────

/** Sanitize so prompt text can't break JSON when echoed (escape quotes, collapse newlines). */
function sanitizeForPrompt(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").trim();
}

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  ebay: "eBay (weight 0.75 — active asking prices; real transaction prices typically 10–20% lower)",
  amazon: "Amazon (weight 0.35 — retail/new price ceiling ONLY, not a resale comp)",
  facebook: "Facebook Marketplace (weight 0.45 — local asking prices, high geographic variance, unverified)",
  google_shopping: "Google Shopping (weight 0.40 — retail price ceiling ONLY)",
  stockx: "StockX via KicksDB (weight 0.95 — authenticated sold prices, highest reliability)",
};

function formatListings(result: AgentResult): string {
  if (result.status !== "success" || result.listings.length === 0) {
    return `  (no data — status: ${result.status})`;
  }
  return result.listings
    .slice(0, 8) // cap per source to keep prompt within token budget
    .map((l) => {
      const title = sanitizeForPrompt(l.title);
      const price = `$${l.price.toFixed(2)}`;
      const cond = l.condition ? ` (${sanitizeForPrompt(l.condition)})` : "";
      const sold = l.date_sold ? ` [sold ${l.date_sold}]` : "";
      const rel = l.relevance_weight != null ? ` relevance=${l.relevance_weight}` : "";
      return `  - "${title}"  ${price}${cond}${sold}${rel}`;
    })
    .join("\n");
}

function buildSynthesisPrompt(item: ItemMetadata, results: AgentResult[]): string {
  const itemBlock = [
    `Name: ${sanitizeForPrompt(item.name)}`,
    item.brand ? `Brand: ${sanitizeForPrompt(item.brand)}` : null,
    `Category: ${sanitizeForPrompt(item.category)}`,
    item.condition ? `Condition: ${sanitizeForPrompt(item.condition)}` : null,
    item.year ? `Year: ${item.year}` : null,
    item.description ? `Description: ${sanitizeForPrompt(item.description)}` : null,
    item.sale_cost && item.sale_cost > 0
      ? `Asking Price: $${item.sale_cost.toFixed(2)}`
      : `Asking Price: not provided`,
  ]
    .filter(Boolean)
    .join("\n");

  const marketDataBlock = results
    .filter((r) => r.status !== "skipped")
    .map((r) => {
      const label = SOURCE_DESCRIPTIONS[r.source] ?? r.source;
      return `[${label}]\n${formatListings(r)}`;
    })
    .join("\n\n");

  const thresholds = RECOMMENDATION_THRESHOLDS;

  return `You are a professional secondhand market appraiser. Analyze the market data below and return an accurate, well-reasoned appraisal.

ITEM:
${itemBlock}

MARKET DATA:
${marketDataBlock}

APPRAISAL RULES:
0. relevance=0.0–1.0: 1=same item/spec, 0.5–0.9=same product different spec (size/set), 0=wrong product. When 2+ eBay listings have relevance=1, prioritize those heavily; same for non-eBay listings with relevance=1. Do NOT use listings with relevance<=0.3 when you have plenty of relevance>0.7 options. If NO listing has relevance above 0.7, return low value_confidence (e.g. 0.3–0.4).
1. eBay is the primary comp source. Listed asking prices are typically 10–20% above what items actually sell for — account for this when estimating value.
2. StockX sold prices are the most reliable data available. If present, weight them heavily.
3. Amazon and Google Shopping are retail CEILINGS — a used/secondhand item is worth less than new retail.
4. Facebook prices have high variance and are often optimistic — weight them lightly.
5. value_confidence: 0.0–1.0 based on data volume, consistency, and relevance. If NO listing has relevance above 0.7, set value_confidence to 0.4 or lower. High price variance or < 5 strong comps = lower confidence.
6. volume_score: 0.0–1.0 where 1.0 = 20+ strong comps, 0.0 = no comps.
7. Recommendation thresholds (only apply if asking price was provided):
   - value_mid >= asking * ${thresholds.BUY_RATIO} → "buy" (great deal)
   - value_mid >= asking * ${thresholds.HAGGLE_LOW} → "haggle" (fair, room to negotiate)
   - value_mid < asking * ${thresholds.PASS_RATIO} → "pass" (overpriced)
   - No asking price OR value_confidence < ${thresholds.MIN_CONFIDENCE_TO_RECOMMEND} → "insufficient_data"
8. Be conservative. When data is noisy or sparse, widen the low–high range and reduce confidence.
9. reasonings must cite specific sources and price points (e.g. "Based on 8 eBay listings ranging $120–$180..."). Keep reasonings to 3–5 sentences maximum.
10. CRITICAL: Output valid JSON only. All string values on one line. No newlines inside strings. Inside any string value, escape double-quotes as \\" (backslash-quote).

Return ONLY valid JSON: double-quoted keys, no trailing commas, no newlines inside strings. Schema:
{
  "value_low": number or null,
  "value_mid": number or null,
  "value_high": number or null,
  "value_confidence": number between 0.0 and 1.0 or null,
  "volume_score": number between 0.0 and 1.0 or null,
  "reasonings": "detailed explanation citing specific sources and data points",
  "caveats": "warnings about condition variance, data quality, geographic pricing — or null if none",
  "recommendation": "buy" | "haggle" | "pass" | "insufficient_data",
  "recommendation_reasoning": "one clear sentence explaining the recommendation"
}`;
}

// ─── Arithmetic fallback ──────────────────────────────────────────────────────

const REL_STRONG = 0.7;   // listings above this are "strong" comps
const REL_DROP = 0.3;    // when we have enough strong comps, don't use listings at or below this

function arithmeticFallback(item: ItemMetadata, results: AgentResult[]): SynthesisResult {
  const weightedPrices: number[] = [];
  const sources: string[] = [];

  // Count strong comps (rel > 0.7) and eBay perfect matches (rel === 1)
  let strongCount = 0;
  let ebayPerfectCount = 0;
  for (const r of results) {
    if (r.status !== "success" || r.listings.length === 0) continue;
    for (const l of r.listings) {
      const rel = l.relevance_weight ?? 1;
      if (rel > REL_STRONG) strongCount++;
      if (r.source === "ebay" && rel === 1) ebayPerfectCount++;
    }
  }

  const excludeLowRelevance = strongCount >= 2;

  for (const r of results) {
    if (r.status !== "success" || r.listings.length === 0) continue;
    sources.push(r.source);
    const sourceW = r.metadata.source_weight;
    for (const l of r.listings) {
      if (l.price <= 0) continue;
      const rel = l.relevance_weight ?? 1;
      if (excludeLowRelevance && rel <= REL_DROP) continue;
      let combined = rel * sourceW;
      if (rel === 1) {
        if (r.source === "ebay" && ebayPerfectCount >= 2) combined *= 1.5;
        else combined *= 1.2;
      }
      const times = Math.max(0, Math.round(combined * 4));
      for (let i = 0; i < times; i++) weightedPrices.push(l.price);
    }
  }

  if (weightedPrices.length === 0) {
    return {
      value_low: null, value_mid: null, value_high: null,
      value_confidence: null, volume_score: null,
      reasonings: "No usable price data returned from any source.",
      caveats: null,
      recommendation: "insufficient_data",
      recommendation_reasoning: "No market data available to support an appraisal.",
    };
  }

  weightedPrices.sort((a, b) => a - b);
  const p25 = weightedPrices[Math.floor(weightedPrices.length * 0.25)];
  const p50 = weightedPrices[Math.floor(weightedPrices.length * 0.50)];
  const p75 = weightedPrices[Math.floor(weightedPrices.length * 0.75)];
  let confidence = Math.min(0.90, 0.35 + (weightedPrices.length / 60) * 0.55);
  if (strongCount === 0) confidence = Math.min(confidence, 0.4);
  const volume_score = Math.min(1.0, weightedPrices.length / 20);

  const sale_cost = item.sale_cost;
  let recommendation: PurchaseRecommendation = "insufficient_data";
  let recommendation_reasoning = "No asking price provided — market value shown only.";

  if (sale_cost && sale_cost > 0 && p50 > 0 && confidence >= RECOMMENDATION_THRESHOLDS.MIN_CONFIDENCE_TO_RECOMMEND) {
    const ratio = p50 / sale_cost;
    if (ratio >= RECOMMENDATION_THRESHOLDS.BUY_RATIO) {
      recommendation = "buy";
      recommendation_reasoning = `Market value ($${p50.toFixed(0)}) is ~${((ratio - 1) * 100).toFixed(0)}% above asking — strong deal.`;
    } else if (ratio >= RECOMMENDATION_THRESHOLDS.HAGGLE_LOW) {
      recommendation = "haggle";
      recommendation_reasoning = `Market value ($${p50.toFixed(0)}) is close to asking — worth negotiating.`;
    } else {
      recommendation = "pass";
      recommendation_reasoning = `Asking price exceeds market value ($${p50.toFixed(0)}) by ~${((1 - ratio) * 100).toFixed(0)}%.`;
    }
  }

  return {
    value_low: p25, value_mid: p50, value_high: p75,
    value_confidence: parseFloat(confidence.toFixed(2)),
    volume_score: parseFloat(volume_score.toFixed(2)),
    reasonings: `Arithmetic synthesis from ${sources.join(", ")} — ${weightedPrices.length} weighted data points.`,
    caveats: "Gemini synthesis unavailable — arithmetic fallback used. Results may be less accurate.",
    recommendation,
    recommendation_reasoning,
  };
}

// ─── Robust JSON parse (Gemini may return markdown, single quotes, trailing commas, newlines in strings) ─

function extractObject(s: string): string {
  const start = s.indexOf("{");
  if (start === -1) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  const q = '"';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === q) { inString = !inString; continue; }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return s.slice(start);
}

/** Exported for tests. Robust parse of Gemini JSON (markdown, single quotes, trailing commas, newlines in strings). */
export function parseGeminiJson(raw: string): unknown {
  let s = raw.trim();
  const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = s.match(codeBlock);
  if (match) s = match[1].trim();
  s = extractObject(s);
  // Replace unescaped newlines inside double-quoted strings (breaks JSON)
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\n/g, " "));
  // Fix single-quoted property names: 'key': -> "key":
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":');
  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synthesizes a price appraisal from PriceAgentOutput using Gemini.
 * Falls back to weighted arithmetic median if Gemini is unavailable.
 *
 * Returns a SynthesisResult that maps directly to AppraisalWriteInput fields.
 */
export async function synthesizeAppraisal(output: PriceAgentOutput): Promise<SynthesisResult> {
  const prompt = buildSynthesisPrompt(output.item, output.results);

  let rawResponse = "";
  try {
    rawResponse = await callGemini(prompt, 0.15, 8192);
    const parsed = parseGeminiJson(rawResponse) as Partial<SynthesisResult>;

    // Validate and coerce required fields
    const result: SynthesisResult = {
      value_low: typeof parsed.value_low === "number" ? parsed.value_low : null,
      value_mid: typeof parsed.value_mid === "number" ? parsed.value_mid : null,
      value_high: typeof parsed.value_high === "number" ? parsed.value_high : null,
      value_confidence: typeof parsed.value_confidence === "number"
        ? Math.max(0, Math.min(1, parsed.value_confidence)) : null,
      volume_score: typeof parsed.volume_score === "number"
        ? Math.max(0, Math.min(1, parsed.volume_score)) : null,
      reasonings: parsed.reasonings || "Appraisal generated by AI synthesis.",
      caveats: parsed.caveats || null,
      recommendation: (["buy", "haggle", "pass", "insufficient_data"].includes(parsed.recommendation as string)
        ? parsed.recommendation : "insufficient_data") as PurchaseRecommendation,
      recommendation_reasoning: parsed.recommendation_reasoning || "See reasonings above.",
    };

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[synthesis] Gemini synthesis failed, using arithmetic fallback:", msg);
    if (process.env.DEBUG_SYNTHESIS === "1" && rawResponse) {
      console.warn("[synthesis] Raw response snippet:", rawResponse.slice(0, 500));
    }
    return arithmeticFallback(output.item, output.results);
  }
}

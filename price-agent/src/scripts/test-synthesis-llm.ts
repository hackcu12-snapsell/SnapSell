/**
 * Quick test for the synthesis Gemini call and JSON parse.
 * Run from price-agent: npx ts-node src/scripts/test-synthesis-llm.ts
 * Requires GEMINI_API_KEY in .env (or parent SnapSell/.env).
 */
import "../env";
import { callGemini } from "../utils/gemini";
import { parseGeminiJson, synthesizeAppraisal } from "../synthesis/index";
import type { PriceAgentOutput, ItemMetadata, AgentResult } from "../types";

const MINIMAL_PROMPT = `You are a market appraiser. Return ONLY valid JSON with double-quoted keys and no newlines inside strings.

ITEM: Nike Dunk Low Panda
MARKET: 2 eBay listings: "$80" and "$95"

Return this exact schema (one line per string value):
{"value_low":70,"value_mid":87.5,"value_high":95,"value_confidence":0.7,"volume_score":0.3,"reasonings":"Based on 2 eBay listings.","caveats":null,"recommendation":"insufficient_data","recommendation_reasoning":"No asking price provided."}`;

async function testMinimalCall() {
  console.log("--- Test 1: Minimal prompt + parse ---\n");
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. Set it in .env or SnapSell/.env");
    process.exit(1);
  }

  try {
    const raw = await callGemini(MINIMAL_PROMPT, 0.1);
    console.log("Raw response length:", raw.length);
    console.log("Raw response (first 600 chars):\n", raw.slice(0, 600));
    if (raw.length > 600) console.log("\n... (truncated)\n");

    const parsed = parseGeminiJson(raw) as Record<string, unknown>;
    console.log("Parsed OK. value_mid =", parsed.value_mid, "reasonings =", String(parsed.reasonings).slice(0, 60));
  } catch (err) {
    console.error("Minimal call failed:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function testFullSynthesis() {
  console.log("\n--- Test 2: Full synthesizeAppraisal with minimal input ---\n");

  const item: ItemMetadata = {
    item_id: "test-1",
    name: "Nike Dunk Low Panda",
    category: "sneakers",
    keywords: [],
    is_streetwear_or_sneakers: true,
    sale_cost: null,
  };

  const result: AgentResult = {
    source: "ebay",
    status: "success",
    query_used: "Nike Dunk Low Panda",
    listings: [
      { title: "Nike Dunk Low Panda size 10", price: 80, currency: "USD", source_detail: "eBay", relevance_weight: 1 },
      { title: "Nike Dunk Low Panda size 11", price: 95, currency: "USD", source_detail: "eBay", relevance_weight: 1 },
    ],
    metadata: {
      total_results_found: 2,
      data_type: "asking_price",
      recency: "realtime",
      geographic_scope: "global",
      source_weight: 0.75,
      caveats: [],
    },
  };

  const output: PriceAgentOutput = {
    item,
    results: [result],
    run_metadata: {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      agents_run: ["ebay"],
      agents_skipped: [],
      agents_failed: [],
      total_listings_collected: 2,
      has_sufficient_data: false,
      fast_path_available: false,
      fast_path_source: null,
    },
  };

  try {
    const appraisal = await synthesizeAppraisal(output);
    console.log("synthesizeAppraisal OK:");
    console.log("  value_mid:", appraisal.value_mid);
    console.log("  value_confidence:", appraisal.value_confidence);
    console.log("  recommendation:", appraisal.recommendation);
    console.log("  reasonings (first 80):", appraisal.reasonings.slice(0, 80));
  } catch (err) {
    console.error("synthesizeAppraisal failed:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function main() {
  console.log("Synthesis LLM test (model:", process.env.GEMINI_MODEL || "default", ")\n");
  await testMinimalCall();
  await testFullSynthesis();
  console.log("\nAll tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

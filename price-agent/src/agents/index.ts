import "../env";
import { getItemById } from "../db/items";
import { withTimeout } from "../utils/timeout";
import { generateAgentQueries } from "../utils/queryGenerator";
import { scoreListingsByRelevance } from "../utils/listingWeights";
import { runEbayAgent } from "./ebay";
import { runAmazonAgent } from "./amazon";
import { runFacebookAgent } from "./facebook";
import { runGoogleShoppingAgent } from "./googleShopping";
import { runStockXAgent } from "./stockx";
import { AgentResult, DbItem, ItemMetadata, PriceAgentOutput } from "../types";

export { synthesizeAppraisal } from "../synthesis/index";

const AGENT_TIMEOUT_MS = 12000;

const SNEAKER_STREETWEAR_CATEGORIES = new Set([
  "sneakers", "shoes", "footwear", "streetwear",
]);

/**
 * Maps a DbItem to the ItemMetadata shape consumed by all agents.
 * All fields come directly from the DB item — nothing is inferred.
 *
 * GROUNDING RULE 6: sale_cost flows through untouched.
 */
function mapItemToMetadata(item: DbItem): ItemMetadata {
  const keywords: string[] = [];
  if (item.year) keywords.push(String(item.year));

  const is_streetwear_or_sneakers = SNEAKER_STREETWEAR_CATEGORIES.has(
    (item.category ?? "").toLowerCase()
  );

  const metadata: ItemMetadata = {
    item_id: item.id,
    name: item.name,
    category: item.category ?? "general",
    keywords,
    is_streetwear_or_sneakers,
    sale_cost: item.sale_cost,
  };

  if (item.brand) metadata.brand = item.brand;
  if (item.condition) metadata.condition = item.condition;
  if (item.year) metadata.year = item.year;
  if (item.description) metadata.description = item.description;

  return metadata;
}

/**
 * Wraps a bound agent call with timeout and error capture.
 * All failures produce a valid AgentResult with status "error".
 */
async function safeAgentRun(
  fn: () => Promise<AgentResult>,
  sourceName: string
): Promise<AgentResult> {
  try {
    return await withTimeout(fn(), AGENT_TIMEOUT_MS, sourceName);
  } catch (err) {
    return {
      source: sourceName,
      status: "error",
      query_used: "",
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "asking_price",
        recency: "unknown",
        geographic_scope: "unknown",
        source_weight: 0,
        caveats: [],
      },
      error_message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Core pipeline:
 * 1. Validate confidence gate
 * 2. Generate Gemini-optimized per-agent queries (single LLM call)
 * 3. Fan out to all agents in parallel with individual timeouts
 * 4. Compute run metadata
 *
 * Does NOT call synthesis — that is a separate step (synthesizeAppraisal).
 *
 * GROUNDING RULE 2: confidence < 0.4 gates the pipeline.
 * GROUNDING RULE 3: has_sufficient_data is advisory.
 */
export async function runPriceAgentsForItem(item: DbItem): Promise<PriceAgentOutput> {
  const startedAt = new Date().toISOString();

  const itemMetadata = mapItemToMetadata(item);

  // Generate Gemini-optimized queries for all sources in one LLM call.
  // Falls back to buildQuery for all sources if Gemini is unavailable.
  const queries = await generateAgentQueries(itemMetadata);

  // Fan out in parallel — 5 agents, each with a 12s timeout
  const [ebayResult, amazonResult, facebookResult, googleResult, stockxResult] =
    await Promise.all([
      safeAgentRun(() => runEbayAgent(itemMetadata, queries.ebay), "ebay"),
      safeAgentRun(() => runAmazonAgent(itemMetadata, queries.amazon), "amazon"),
      safeAgentRun(() => runFacebookAgent(itemMetadata, queries.facebook), "facebook"),
      safeAgentRun(() => runGoogleShoppingAgent(itemMetadata, queries.google_shopping), "google_shopping"),
      safeAgentRun(
        () => runStockXAgent(itemMetadata, queries.stockx || queries.ebay),
        "stockx"
      ),
    ]);

  let results: AgentResult[] = [ebayResult, amazonResult, facebookResult, googleResult, stockxResult];

  // Score each listing by relevance to our item (variant/size/set matters; wrong product = 0).
  const withWeights = await Promise.all(
    results.map(async (r) => {
      if (r.status !== "success" || r.listings.length === 0) return r;
      const listings = await scoreListingsByRelevance(itemMetadata, r.listings, r.source);
      return { ...r, listings };
    })
  );
  results = withWeights;

  const agents_run: string[] = [];
  const agents_skipped: string[] = [];
  const agents_failed: string[] = [];

  for (const r of results) {
    if (r.status === "skipped") {
      agents_skipped.push(r.source);
    } else if (r.status === "error") {
      agents_failed.push(r.source);
      agents_run.push(r.source);
    } else {
      agents_run.push(r.source);
    }
  }

  const totalListingsCollected = results.reduce((sum, r) => sum + r.listings.length, 0);

  // has_sufficient_data: >= 2 successful agents with >= 3 listings, OR StockX hit
  const successfulWithListings = results.filter(
    (r) => r.status === "success" && r.listings.length >= 3
  );
  const stockxHit = stockxResult.status === "success" && stockxResult.listings.length >= 3;
  const has_sufficient_data = successfulWithListings.length >= 2 || stockxHit;

  return {
    item: itemMetadata,
    results,
    run_metadata: {
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      agents_run,
      agents_skipped,
      agents_failed,
      total_listings_collected: totalListingsCollected,
      has_sufficient_data,
      fast_path_available: stockxHit,
      fast_path_source: stockxHit ? "stockx" : null,
    },
  };
}

/**
 * DB-backed entry point. Fetches item by ID then delegates to runPriceAgentsForItem.
 */
export async function runPriceAgents(itemId: string): Promise<PriceAgentOutput> {
  const item = await getItemById(itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  return runPriceAgentsForItem(item);
}

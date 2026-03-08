import "../env";
import fetch from "node-fetch";
import { AgentResult, ItemMetadata, Listing } from "../types";

// GROUNDING RULE 4: Source weights are fixed constants. Never adjust dynamically.
const SOURCE_WEIGHT = 0.95;
const SOURCE_NAME = "stockx";

if (!process.env.KICKSDB_API_KEY) {
  throw new Error("Missing required environment variable: KICKSDB_API_KEY");
}

/**
 * Returns true if the product name shares at least one significant word
 * (length >= 3) with the query string. This prevents wrong catalog matches.
 *
 * GROUNDING RULE 5: Name match is mandatory.
 * A wrong catalog match is worse than returning no_data.
 */
function hasSignificantNameMatch(productName: string, query: string): boolean {
  const stopWords = new Set(["the", "and", "for", "with", "from", "size"]);
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  const productLower = productName.toLowerCase();
  return queryWords.some((word) => productLower.includes(word));
}

/**
 * Queries KicksDB for StockX authenticated sold prices.
 * `query` is the Gemini-generated exact model+colorway string.
 *
 * Conditional — only runs when item.is_streetwear_or_sneakers is true.
 * Weight 0.95 — highest reliability: authenticated sold prices.
 */
export async function runStockXAgent(item: ItemMetadata, query: string): Promise<AgentResult> {
  // Conditional agent — only runs for streetwear/sneaker items
  if (!item.is_streetwear_or_sneakers) {
    return {
      source: SOURCE_NAME,
      status: "skipped",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "sold_price",
        recency: "daily",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: [],
      },
    };
  }

  const errorResult = (message: string): AgentResult => ({
    source: SOURCE_NAME,
    status: "error",
    query_used: query,
    listings: [],
    metadata: {
      total_results_found: 0,
      data_type: "sold_price",
      recency: "daily",
      geographic_scope: "global",
      source_weight: SOURCE_WEIGHT,
      caveats: [],
    },
    error_message: message,
  });

  // Step 1: Search for product (documented: GET /v3/stockx/products?query=...)
  const searchUrl = new URL("https://api.kicks.dev/v3/stockx/products");
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("limit", "5");

  const apiKey = process.env.KICKSDB_API_KEY!;
  const authHeader = `Bearer ${apiKey}`;
  let searchResponse: Awaited<ReturnType<typeof fetch>>;
  try {
    searchResponse = await fetch(searchUrl.toString(), {
      headers: { Authorization: authHeader },
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error on product search");
  }

  if (!searchResponse.ok) {
    return errorResult(`KicksDB search error: HTTP ${searchResponse.status}`);
  }

  let searchBody: unknown;
  try {
    searchBody = await searchResponse.json();
  } catch {
    return errorResult("KicksDB search response was not valid JSON");
  }

  const searchData = searchBody as {
    data?: Array<{ id?: string; slug?: string; title?: string; name?: string; sku?: string }>;
  };

  if (!searchData.data || searchData.data.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "sold_price",
        recency: "daily",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["StockX prices are for deadstock/authenticated items. Worn condition trades lower."],
      },
    };
  }

  const topResult = searchData.data[0];
  const productName = topResult.title ?? topResult.name ?? "";
  const productId = topResult.id ?? topResult.slug ?? "";

  // GROUNDING RULE 5: Name match validation
  if (!hasSignificantNameMatch(productName, query)) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "sold_price",
        recency: "daily",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["StockX prices are for deadstock/authenticated items. Worn condition trades lower."],
      },
    };
  }

  if (!productId) {
    return errorResult("KicksDB product result missing id field");
  }

  // Step 2: Fetch daily sales data for matched product
  const salesUrl = new URL(
    `https://api.kicks.dev/v3/stockx/products/${productId}/sales/daily`
  );
  salesUrl.searchParams.set("limit", "14");

  let salesResponse: Awaited<ReturnType<typeof fetch>>;
  try {
    salesResponse = await fetch(salesUrl.toString(), {
      headers: { Authorization: authHeader },
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error on sales fetch");
  }

  if (!salesResponse.ok) {
    return errorResult(`KicksDB sales error: HTTP ${salesResponse.status}`);
  }

  let salesBody: unknown;
  try {
    salesBody = await salesResponse.json();
  } catch {
    return errorResult("KicksDB sales response was not valid JSON");
  }

  const salesData = salesBody as {
    data?: Array<{
      date?: string;
      averagePrice?: number;
      orders?: number;
    }>;
  };

  if (!salesData.data || salesData.data.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "sold_price",
        recency: "daily",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["StockX prices are for deadstock/authenticated items. Worn condition trades lower."],
      },
    };
  }

  // GROUNDING RULE 1: No price calculations in agent layer.
  // Filter out days with fewer than 2 orders (statistically unreliable)
  const listings: Listing[] = salesData.data
    .filter((day) => (day.orders ?? 0) >= 2)
    .map((day): Listing | null => {
      const price = day.averagePrice ?? 0;
      if (!price || price <= 0 || isNaN(price)) return null;
      return {
        title: productName,
        price,
        currency: "USD",
        date_sold: day.date,
        source_detail: "StockX daily avg",
      };
    })
    .filter((l): l is Listing => l !== null);

  if (listings.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "sold_price",
        recency: "daily",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["StockX prices are for deadstock/authenticated items. Worn condition trades lower."],
      },
    };
  }

  return {
    source: SOURCE_NAME,
    status: "success",
    query_used: query,
    listings,
    metadata: {
      total_results_found: listings.length,
      data_type: "sold_price",
      recency: "daily",
      geographic_scope: "global",
      source_weight: SOURCE_WEIGHT,
      caveats: [
        "StockX prices are for deadstock/authenticated items. Worn condition trades lower.",
      ],
    },
  };
}

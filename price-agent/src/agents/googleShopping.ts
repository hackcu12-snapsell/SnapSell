import "../env";
import fetch from "node-fetch";
import { AgentResult, ItemMetadata, Listing } from "../types";

// GROUNDING RULE 4: Source weights are fixed constants. Never adjust dynamically.
const SOURCE_WEIGHT = 0.40;
const SOURCE_NAME = "google_shopping";

if (!process.env.SERPAPI_KEY) {
  throw new Error("Missing required environment variable: SERPAPI_KEY");
}

/**
 * Queries Google Shopping via SerpAPI for retail price anchor.
 * `query` is the Gemini-optimized search string.
 *
 * Weight 0.40 — retail ceiling only. Synthesis treats these as upper bound.
 */
export async function runGoogleShoppingAgent(_item: ItemMetadata, query: string): Promise<AgentResult> {
  const errorResult = (message: string): AgentResult => ({
    source: SOURCE_NAME,
    status: "error",
    query_used: query,
    listings: [],
    metadata: {
      total_results_found: 0,
      data_type: "retail_price",
      recency: "daily",
      geographic_scope: "national",
      source_weight: SOURCE_WEIGHT,
      caveats: [],
    },
    error_message: message,
  });

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", process.env.SERPAPI_KEY!);

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error");
  }

  if (!response.ok) {
    return errorResult(`SerpAPI Google Shopping error: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("SerpAPI Google Shopping response was not valid JSON");
  }

  const data = body as {
    shopping_results?: Array<{
      title?: string;
      extracted_price?: number;
      link?: string;
      source?: string;
    }>;
  };

  if (!data.shopping_results || data.shopping_results.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "retail_price",
        recency: "daily",
        geographic_scope: "national",
        source_weight: SOURCE_WEIGHT,
        caveats: ["New/retail pricing only. Use as price ceiling."],
      },
    };
  }

  // GROUNDING RULE 1: No price calculations in agent layer.
  const listings: Listing[] = data.shopping_results
    .slice(0, 10)
    .map((result): Listing | null => {
      const price = result.extracted_price ?? 0;
      if (!price || price <= 0 || isNaN(price)) return null;
      return {
        title: result.title ?? "",
        price,
        currency: "USD",
        url: result.link,
        source_detail: result.source ?? "Google Shopping",
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
        data_type: "retail_price",
        recency: "daily",
        geographic_scope: "national",
        source_weight: SOURCE_WEIGHT,
        caveats: ["New/retail pricing only. Use as price ceiling."],
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
      data_type: "retail_price",
      recency: "daily",
      geographic_scope: "national",
      source_weight: SOURCE_WEIGHT,
      caveats: ["New/retail pricing only. Use as price ceiling."],
    },
  };
}

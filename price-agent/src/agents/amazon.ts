import "../env";
import fetch from "node-fetch";
import { AgentResult, ItemMetadata, Listing } from "../types";

// GROUNDING RULE 4: Source weights are fixed constants. Never adjust dynamically.
const SOURCE_WEIGHT = 0.35;
const SOURCE_NAME = "amazon";

if (!process.env.SERPAPI_KEY) {
  throw new Error("Missing required environment variable: SERPAPI_KEY");
}

/**
 * Queries Amazon via SerpAPI for retail price anchor.
 * `query` is the Gemini-optimized search string.
 *
 * Weight 0.35 — retail/new only. Not a secondhand comp.
 * Synthesis uses these as price ceiling, not market value.
 */
export async function runAmazonAgent(_item: ItemMetadata, query: string): Promise<AgentResult> {
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
  url.searchParams.set("engine", "amazon");
  url.searchParams.set("k", query);
  url.searchParams.set("amazon_domain", "amazon.com");
  url.searchParams.set("api_key", process.env.SERPAPI_KEY!);

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error");
  }

  if (!response.ok) {
    return errorResult(`SerpAPI Amazon error: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("SerpAPI Amazon response was not valid JSON");
  }

  const data = body as {
    organic_results?: Array<{
      title?: string;
      extracted_price?: number;
      link?: string;
    }>;
  };

  if (!data.organic_results || data.organic_results.length === 0) {
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
        caveats: ["Retail/new price anchor only. Not a secondhand resale comp."],
      },
    };
  }

  // GROUNDING RULE 1: No price calculations in agent layer.
  const listings: Listing[] = data.organic_results
    .slice(0, 8)
    .map((result): Listing | null => {
      const price = result.extracted_price ?? 0;
      if (!price || price <= 0 || isNaN(price)) return null;
      return {
        title: result.title ?? "",
        price,
        currency: "USD",
        url: result.link,
        source_detail: "Amazon",
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
        caveats: ["Retail/new price anchor only. Not a secondhand resale comp."],
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
      caveats: ["Retail/new price anchor only. Not a secondhand resale comp."],
    },
  };
}

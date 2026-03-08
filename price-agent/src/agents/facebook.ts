import "../env";
import fetch from "node-fetch";
import { AgentResult, ItemMetadata, Listing } from "../types";

// GROUNDING RULE 4: Source weights are fixed constants. Never adjust dynamically.
const SOURCE_WEIGHT = 0.45;
const SOURCE_NAME = "facebook";

if (!process.env.APIFY_API_KEY) {
  throw new Error("Missing required environment variable: APIFY_API_KEY");
}

function normalizePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return parsed > 0 && !isNaN(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Scrapes Facebook Marketplace via Apify.
 * `query` is the Gemini-generated local-friendly search string.
 *
 * Input format: startUrls with a constructed FB Marketplace search URL.
 * (The searchQuery body param is not supported by this actor version.)
 */
export async function runFacebookAgent(_item: ItemMetadata, query: string): Promise<AgentResult> {
  const errorResult = (message: string): AgentResult => ({
    source: SOURCE_NAME,
    status: "error",
    query_used: query,
    listings: [],
    metadata: {
      total_results_found: 0,
      data_type: "asking_price",
      recency: "realtime",
      geographic_scope: "local",
      source_weight: SOURCE_WEIGHT,
      caveats: [],
    },
    error_message: message,
  });

  // Construct the Facebook Marketplace search URL
  const encodedQuery = encodeURIComponent(query);
  const marketplaceUrl = `https://www.facebook.com/marketplace/search/?query=${encodedQuery}`;

  const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-marketplace-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}`;

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: marketplaceUrl }],
        maxItems: 15,
      }),
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error");
  }

  if (!response.ok) {
    if (response.status === 402) {
      return errorResult(
        "Apify returned 402 Payment Required. Add billing or credits at apify.com to use the Facebook Marketplace scraper."
      );
    }
    return errorResult(`Apify Facebook Marketplace error: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("Apify response was not valid JSON");
  }

  const items = Array.isArray(body) ? body : [];

  // GROUNDING RULE 1: No price calculations in agent layer.
  const listings: Listing[] = items
    .map((fbItem: Record<string, unknown>): Listing | null => {
      const price = normalizePrice(fbItem.price ?? fbItem.priceAmount);
      if (!price) return null;
      return {
        title: String(fbItem.title ?? fbItem.name ?? ""),
        price,
        currency: "USD",
        url: typeof fbItem.url === "string" ? fbItem.url : undefined,
        source_detail: "Facebook Marketplace",
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
        data_type: "asking_price",
        recency: "realtime",
        geographic_scope: "local",
        source_weight: SOURCE_WEIGHT,
        caveats: ["Local pricing only. High geographic variance. Seller unverified."],
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
      data_type: "asking_price",
      recency: "realtime",
      geographic_scope: "local",
      source_weight: SOURCE_WEIGHT,
      caveats: ["Local pricing only. High geographic variance. Seller unverified."],
    },
  };
}

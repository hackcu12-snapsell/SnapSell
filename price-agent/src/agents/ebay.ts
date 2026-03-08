import "../env";
import fetch from "node-fetch";
import { AgentResult, ItemMetadata, Listing } from "../types";
import { buildConditionFilter } from "../utils/queryBuilder";
import { filterListingsByRelevance } from "../utils/listingRelevance";

// GROUNDING RULE 4: Source weights are fixed constants. Never adjust dynamically.
const SOURCE_WEIGHT = 0.75;
const SOURCE_NAME = "ebay";

if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
  throw new Error("Missing required environment variables: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET");
}

// Sandbox credentials (e.g. CLIENT_ID containing "SBX") route to sandbox endpoints.
const isSandbox =
  process.env.EBAY_CLIENT_ID.includes("SBX") || process.env.EBAY_USE_SANDBOX === "true";
const EBAY_BASE = isSandbox
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

// ─── OAuth token cache ────────────────────────────────────────────────────────

interface TokenCache {
  access_token: string;
  expires_at: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires_at - 60_000) {
    return tokenCache.access_token;
  }

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!response.ok) {
    throw new Error(`eBay OAuth failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.access_token;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * Queries eBay Browse API for active listings.
 * `query` is the Gemini-optimized search string from the orchestrator.
 *
 * Primary comp source — weight 0.75. Asking prices only; actual transaction
 * prices typically run 10–20% lower, which synthesis accounts for.
 */
export async function runEbayAgent(item: ItemMetadata, query: string): Promise<AgentResult> {
  const conditionFilter = buildConditionFilter(item, "ebay");

  const errorResult = (message: string): AgentResult => ({
    source: SOURCE_NAME,
    status: "error",
    query_used: query,
    listings: [],
    metadata: {
      total_results_found: 0,
      data_type: "asking_price",
      recency: "realtime",
      geographic_scope: "global",
      source_weight: SOURCE_WEIGHT,
      caveats: [],
    },
    error_message: message,
  });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "eBay auth failed");
  }

  const url = new URL(`${EBAY_BASE}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set("sort", "price");
  if (conditionFilter) {
    url.searchParams.set("filter", conditionFilter);
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Network error");
  }

  if (!response.ok) {
    return errorResult(`eBay Browse API error: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("eBay response was not valid JSON");
  }

  const data = body as {
    itemSummaries?: Array<{
      title?: string;
      price?: { value?: string; currency?: string };
      condition?: string;
      itemWebUrl?: string;
    }>;
    total?: number;
  };

  if (!data.itemSummaries || data.itemSummaries.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: 0,
        data_type: "asking_price",
        recency: "realtime",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["Asking prices only — actual sale prices typically 10–20% lower."],
      },
    };
  }

  // GROUNDING RULE 1: No price calculations in agent layer.
  let listings: Listing[] = data.itemSummaries
    .map((listing): Listing | null => {
      const price = parseFloat(listing.price?.value ?? "0");
      if (!price || price <= 0 || isNaN(price)) return null;
      return {
        title: listing.title ?? "",
        price,
        currency: listing.price?.currency ?? "USD",
        condition: listing.condition,
        url: listing.itemWebUrl,
        source_detail: isSandbox ? "eBay Browse API (sandbox)" : "eBay Browse API",
      };
    })
    .filter((l): l is Listing => l !== null);

  // Relevance filter: keep only listings that match the item (same product/model).
  if (listings.length > 0) {
    const filtered = await filterListingsByRelevance(item, listings, "eBay");
    if (filtered.length > 0) listings = filtered;
  }

  if (listings.length === 0) {
    return {
      source: SOURCE_NAME,
      status: "no_data",
      query_used: query,
      listings: [],
      metadata: {
        total_results_found: data.total ?? 0,
        data_type: "asking_price",
        recency: "realtime",
        geographic_scope: "global",
        source_weight: SOURCE_WEIGHT,
        caveats: ["Asking prices only — actual sale prices typically 10–20% lower."],
      },
    };
  }

  return {
    source: SOURCE_NAME,
    status: "success",
    query_used: query,
    listings,
    metadata: {
      total_results_found: data.total ?? listings.length,
      data_type: "asking_price",
      recency: "realtime",
      geographic_scope: "global",
      source_weight: SOURCE_WEIGHT,
      caveats: ["Asking prices only — actual sale prices typically 10–20% lower."],
    },
  };
}

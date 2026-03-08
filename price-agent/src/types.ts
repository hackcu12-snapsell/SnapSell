import "dotenv/config";

// ─── Database layer ───────────────────────────────────────────────────────────

export interface DbItem {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  condition: string | null;
  category: string | null;
  brand: string | null;
  year: number | null;
  status: string | null;
  sale_cost: number | null;
}

export interface DbAppraisal {
  id: string;
  item_id: string;
  appraised_at: string;
  value_low: number | null;
  value_mid: number | null;
  value_high: number | null;
  value_confidence: number | null;
  volume_score: number | null;
  reasonings: string;
  caveats: string | null;
  agents_used: string[];
  agents_failed: string[];
  raw_agent_output: PriceAgentOutput;
}

export interface DbListingReference {
  id: string;
  appraisal_id: string;
  url: string | null;
  source: string;
  price: number;
  condition: string | null;
  title: string | null;
  data_type: DataType;
}

// ─── Agent layer ──────────────────────────────────────────────────────────────

export type DataType = "asking_price" | "sold_price" | "retail_price";

export type AgentStatus = "success" | "no_data" | "error" | "skipped";

export type GeographicScope = "local" | "national" | "global" | "unknown";

export interface ItemMetadata {
  item_id: string;                     // items.id — carried for DB write
  name: string;
  brand?: string;
  category: string;
  condition?: string;
  year?: number;
  description?: string;                // passed through for richer Gemini query/synthesis context
  keywords: string[];
  is_streetwear_or_sneakers: boolean;  // derived from category — gates StockX agent
  sale_cost: number | null;            // from items.sale_cost — for Buy/Haggle/Pass layer
}

export interface Listing {
  title: string;
  price: number;           // USD float
  currency: string;        // ISO 4217
  condition?: string;
  url?: string;
  date_listed?: string;    // ISO 8601
  date_sold?: string;      // ISO 8601 — sold price sources only
  source_detail: string;   // e.g. "TCGPlayer", "StockX daily avg"
  /** 0–1 relevance to the item we're pricing; set by listing-weighter. Omit = treat as 1. */
  relevance_weight?: number;
}

export interface AgentResult {
  source: string;
  status: AgentStatus;
  query_used: string;
  listings: Listing[];
  metadata: {
    total_results_found: number;
    data_type: DataType;
    recency: "realtime" | "daily" | "weekly" | "unknown";
    geographic_scope: GeographicScope;
    source_weight: number;  // fixed per-source — see weights table
    caveats: string[];
  };
  error_message?: string;
}

export interface PriceAgentOutput {
  item: ItemMetadata;
  results: AgentResult[];
  run_metadata: {
    started_at: string;
    completed_at: string;
    agents_run: string[];
    agents_skipped: string[];
    agents_failed: string[];
    total_listings_collected: number;
    has_sufficient_data: boolean;
    fast_path_available: boolean;
    fast_path_source: string | null;
  };
}

// ─── Appraisal write contract ─────────────────────────────────────────────────
// Synthesis layer and this module share one contract.

export interface AppraisalWriteInput {
  item_id: string;
  value_low: number | null;
  value_mid: number | null;
  value_high: number | null;
  value_confidence: number | null;
  volume_score: number | null;
  reasonings: string;
  caveats: string | null;
  recommendation: string;
  listing_references: ListingReferenceWriteInput[];
}

export interface ListingReferenceWriteInput {
  url: string | null;
  source: string;
  price: number;
  condition: string | null;
}

// ─── Buy / Haggle / Pass output ───────────────────────────────────────────────
// NOT implemented in this module. Typed here so the rest of the app knows
// what shape to expect from the synthesis layer.

export type PurchaseRecommendation = "buy" | "haggle" | "pass" | "insufficient_data";

export interface AppraisalResult {
  appraisal_id: string;
  item_id: string;
  recommendation: PurchaseRecommendation;
  recommendation_reasoning: string;    // one sentence, human-readable
  // Appraised value
  value_low: number | null;
  value_mid: number | null;
  value_high: number | null;
  value_confidence: number | null;
  volume_score: number | null;
  // Asking price context
  sale_cost: number | null;
  value_vs_ask_ratio: number | null;
  // value_mid / sale_cost. null if sale_cost is null or 0.
  // Used by the modal: > BUY_RATIO = buy, HAGGLE_LOW–BUY_RATIO = haggle, < HAGGLE_LOW = pass
  // Detail view
  reasonings: string;
  caveats: string | null;
  sources_used: string[];
  listing_references: DbListingReference[];
  appraised_at: string;
}

// Synthesis layer uses these thresholds to derive recommendation.
// Exported here so they are the single source of truth across the app.
export const RECOMMENDATION_THRESHOLDS = {
  BUY_RATIO: 1.15,     // value_mid >= 115% of sale_cost → BUY
  HAGGLE_LOW: 0.90,    // value_mid 90–115% of sale_cost → HAGGLE
  PASS_RATIO: 0.90,    // value_mid < 90% of sale_cost → PASS
  // If sale_cost is null/0: recommendation = "insufficient_data" on ask comparison
  // but value range is still appraised and shown.
  MIN_CONFIDENCE_TO_RECOMMEND: 0.25,  // below this, force "insufficient_data"
} as const;

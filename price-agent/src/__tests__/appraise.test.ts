/**
 * Tests for handleAppraise — mocks all I/O so no DB or real API calls are made.
 * Verifies: item load → pipeline → DB write → appraisal_id returned.
 */

// Factory-form mocks prevent Jest from loading the real modules (which import
// ESM node-fetch and would fail to parse). Same pattern as agents.test.ts.
jest.mock("../db/items", () => ({ getItemById: jest.fn() }));
jest.mock("../db/appraisals", () => ({ writeAppraisal: jest.fn() }));
jest.mock("../agents/index", () => ({
  runPriceAgentsForItem: jest.fn(),
  synthesizeAppraisal: jest.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ITEM = {
  id: "42",
  user_id: "1",
  name: "Nike Air Jordan 1",
  brand: "Nike",
  category: "Sneakers",
  condition: null,
  description: null,
  year: 2020,
  status: "pending",
  sale_cost: 150,
};

const AGENT_OUTPUT = {
  item: {
    item_id: "42",
    name: "Nike Air Jordan 1",
    category: "Sneakers",
    keywords: [],
    is_streetwear_or_sneakers: true,
    sale_cost: 150,
  },
  results: [
    {
      source: "ebay",
      status: "success",
      query_used: "Nike Air Jordan 1",
      listings: [
        { title: "Jordan 1 Chicago", price: 200, currency: "USD", source_detail: "eBay", url: "https://ebay.com/1", condition: "used" },
        { title: "Jordan 1 Chicago Used", price: 180, currency: "USD", source_detail: "eBay", url: "https://ebay.com/2", condition: "used" },
      ],
      metadata: { total_results_found: 2, data_type: "asking_price", recency: "realtime", geographic_scope: "global", source_weight: 0.80, caveats: [] },
    },
    {
      source: "amazon",
      status: "no_data",
      query_used: "Nike Air Jordan 1",
      listings: [],
      metadata: { total_results_found: 0, data_type: "asking_price", recency: "unknown", geographic_scope: "unknown", source_weight: 0, caveats: [] },
    },
  ],
  run_metadata: {
    started_at: "2024-01-01T00:00:00Z",
    completed_at: "2024-01-01T00:00:01Z",
    agents_run: ["ebay", "amazon"],
    agents_skipped: [],
    agents_failed: [],
    total_listings_collected: 2,
    has_sufficient_data: false,
    fast_path_available: false,
    fast_path_source: null,
  },
};

const SYNTHESIS = {
  value_low: 170,
  value_mid: 190,
  value_high: 210,
  value_confidence: 0.72,
  volume_score: 0.30,
  reasonings: "Based on 2 eBay listings ranging $180–$200.",
  caveats: null,
  recommendation: "haggle",
  recommendation_reasoning: "Market value is close to asking — worth negotiating.",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleAppraise", () => {
  let getItemById: jest.Mock;
  let writeAppraisal: jest.Mock;
  let runPriceAgentsForItem: jest.Mock;
  let synthesizeAppraisal: jest.Mock;
  let handleAppraise: (id: string) => Promise<{ appraisal_id: string }>;

  beforeEach(async () => {
    jest.resetModules();

    const itemsMod = await import("../db/items");
    const appraisalsMod = await import("../db/appraisals");
    const agentsMod = await import("../agents/index");

    getItemById = itemsMod.getItemById as jest.Mock;
    writeAppraisal = appraisalsMod.writeAppraisal as jest.Mock;
    runPriceAgentsForItem = agentsMod.runPriceAgentsForItem as jest.Mock;
    synthesizeAppraisal = agentsMod.synthesizeAppraisal as jest.Mock;

    getItemById.mockResolvedValue(ITEM);
    runPriceAgentsForItem.mockResolvedValue(AGENT_OUTPUT);
    synthesizeAppraisal.mockResolvedValue(SYNTHESIS);
    writeAppraisal.mockResolvedValue({ appraisal_id: "99" });

    ({ handleAppraise } = await import("../appraise"));
  });

  test("1. returns appraisal_id on success", async () => {
    const result = await handleAppraise("42");
    expect(result).toEqual({ appraisal_id: "99" });
  });

  test("2. writeAppraisal receives correct mapped fields and listing_references", async () => {
    await handleAppraise("42");

    expect(writeAppraisal).toHaveBeenCalledTimes(1);
    const input = writeAppraisal.mock.calls[0][0];

    expect(input.item_id).toBe("42");
    expect(input.value_low).toBe(170);
    expect(input.value_mid).toBe(190);
    expect(input.value_high).toBe(210);
    expect(input.recommendation).toBe("haggle");

    // Only "success" agent listings become listing_references; "no_data" amazon is excluded
    expect(input.listing_references).toHaveLength(2);
    expect(input.listing_references[0]).toMatchObject({ source: "ebay", price: 200, url: "https://ebay.com/1" });
    expect(input.listing_references[1]).toMatchObject({ source: "ebay", price: 180, url: "https://ebay.com/2" });
  });

  test("3. throws when item not found", async () => {
    getItemById.mockResolvedValue(null);
    await expect(handleAppraise("nonexistent")).rejects.toThrow("Item not found");
  });

  test("4. throws when DB write returns empty appraisal_id", async () => {
    writeAppraisal.mockResolvedValue({ appraisal_id: "" });
    await expect(handleAppraise("42")).rejects.toThrow("DB write failed");
  });
});

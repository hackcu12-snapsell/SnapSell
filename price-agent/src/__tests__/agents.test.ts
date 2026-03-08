import { buildQuery } from "../utils/queryBuilder";
import { withTimeout } from "../utils/timeout";
import { ItemMetadata } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ItemMetadata> = {}): ItemMetadata {
  return {
    item_id: "test-uuid",
    name: "Generic Item",
    category: "general",
    keywords: [],
    is_streetwear_or_sneakers: false,
    sale_cost: null,
    ...overrides,
  };
}

// ─── buildQuery ───────────────────────────────────────────────────────────────

describe("buildQuery", () => {
  test("1a. builds 'Brand Name' string from full metadata", () => {
    const item = makeItem({ name: "Air Jordan 1 Chicago", brand: "Nike" });
    const q = buildQuery(item);
    expect(q).toContain("Nike");
    expect(q).toContain("Air Jordan");
  });

  test("1b. falls back to keywords when brand+name too short", () => {
    const item = makeItem({ name: "X", brand: undefined, keywords: ["nintendo", "gameboy"] });
    const q = buildQuery(item);
    expect(q.length).toBeGreaterThan(0);
  });

  test("1c. trims to maxLength", () => {
    const item = makeItem({ name: "A".repeat(200), brand: "B".repeat(50) });
    expect(buildQuery(item, 50).length).toBeLessThanOrEqual(50);
  });
});

// ─── withTimeout ──────────────────────────────────────────────────────────────

describe("withTimeout", () => {
  test("2. rejects after ms with descriptive message", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 50, "TestAgent")).rejects.toThrow(
      "TestAgent timed out after 50ms"
    );
  });

  test("resolves normally when promise completes in time", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 5000, "TestAgent");
    expect(result).toBe("ok");
  });
});

// ─── eBay agent ───────────────────────────────────────────────────────────────

describe("runEbayAgent", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
  });

  test("3. returns no_data when itemSummaries is empty", async () => {
    jest.mock("node-fetch", () =>
      jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok", expires_in: 7200 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ itemSummaries: [], total: 0 }) })
    );
    const { runEbayAgent } = await import("../agents/ebay");
    const result = await runEbayAgent(makeItem({ name: "Nike Air Jordan 1", brand: "Nike" }), "Nike Air Jordan 1");
    expect(result.source).toBe("ebay");
    expect(result.status).toBe("no_data");
    expect(result.listings).toHaveLength(0);
  });

  test("4. returns error when fetch throws", async () => {
    jest.mock("node-fetch", () =>
      jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok", expires_in: 7200 }) })
        .mockRejectedValueOnce(new Error("Network failure"))
    );
    const { runEbayAgent } = await import("../agents/ebay");
    const result = await runEbayAgent(makeItem({ name: "Nike Air Jordan 1" }), "Nike Air Jordan 1");
    expect(result.status).toBe("error");
    expect(result.error_message).toContain("Network failure");
  });
});

// ─── StockX agent ─────────────────────────────────────────────────────────────

describe("runStockXAgent", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.KICKSDB_API_KEY = "test-kicks-key";
  });

  test("5. returns skipped when is_streetwear_or_sneakers is false", async () => {
    const { runStockXAgent } = await import("../agents/stockx");
    const result = await runStockXAgent(makeItem({ is_streetwear_or_sneakers: false }), "");
    expect(result.status).toBe("skipped");
  });

  test("6. returns no_data when product name does not match query", async () => {
    jest.mock("node-fetch", () =>
      jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "999", title: "Completely Different Product XYZ" }] }),
      })
    );
    const { runStockXAgent } = await import("../agents/stockx");
    const result = await runStockXAgent(
      makeItem({ name: "Nike Air Jordan 1 Chicago", is_streetwear_or_sneakers: true }),
      "Air Jordan 1 Chicago"
    );
    expect(result.status).toBe("no_data");
  });
});

// ─── Orchestrator ─────────────────────────────────────────────────────────────

describe("runPriceAgents orchestrator", () => {
  beforeEach(() => {
    jest.resetModules();
    // Suppress expected Gemini fallback warnings in test output (no API key in test env)
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); });

  const noData = (source: string) => ({
    source,
    status: "no_data" as const,
    listings: [],
    query_used: "test",
    metadata: { total_results_found: 0, data_type: "asking_price" as const, recency: "unknown" as const, geographic_scope: "unknown" as const, source_weight: 0, caveats: [] },
  });

  test("7. has_sufficient_data is false when all agents return no_data", async () => {
    jest.mock("../db/items", () => ({
      getItemById: jest.fn().mockResolvedValue({ id: "test-uuid", user_id: "u", name: "Some Item", brand: "BrandX", category: "Electronics", condition: "used", description: null, year: null, status: null, sale_cost: null }),
    }));
    jest.mock("../agents/ebay", () => ({ runEbayAgent: jest.fn().mockResolvedValue(noData("ebay")) }));
    jest.mock("../agents/amazon", () => ({ runAmazonAgent: jest.fn().mockResolvedValue(noData("amazon")) }));
    jest.mock("../agents/facebook", () => ({ runFacebookAgent: jest.fn().mockResolvedValue(noData("facebook")) }));
    jest.mock("../agents/googleShopping", () => ({ runGoogleShoppingAgent: jest.fn().mockResolvedValue(noData("google_shopping")) }));
    jest.mock("../agents/stockx", () => ({ runStockXAgent: jest.fn().mockResolvedValue({ ...noData("stockx"), status: "skipped" }) }));

    const { runPriceAgents } = await import("../agents/index");
    const output = await runPriceAgents("test-uuid");
    expect(output.run_metadata.has_sufficient_data).toBe(false);
  });

  test("8. agents run in parallel — total time < sum of sequential timeouts", async () => {
    const DELAY = 80;
    const success = (source: string) => ({
      source,
      status: "success" as const,
      query_used: "test",
      listings: Array.from({ length: 4 }, (_, i) => ({ title: `Item ${i}`, price: 100 + i, currency: "USD", source_detail: source })),
      metadata: { total_results_found: 4, data_type: "asking_price" as const, recency: "realtime" as const, geographic_scope: "global" as const, source_weight: 0.75, caveats: [] },
    });

    jest.mock("../db/items", () => ({
      getItemById: jest.fn().mockResolvedValue({ id: "test-uuid", user_id: "u", name: "Nike Air Jordan 1", brand: "Nike", category: "Sneakers", condition: "used", description: null, year: null, status: null, sale_cost: null }),
    }));
    const delayed = (src: string) => jest.fn().mockImplementation(() => new Promise(r => setTimeout(() => r(success(src)), DELAY)));
    jest.mock("../agents/ebay", () => ({ runEbayAgent: delayed("ebay") }));
    jest.mock("../agents/amazon", () => ({ runAmazonAgent: delayed("amazon") }));
    jest.mock("../agents/facebook", () => ({ runFacebookAgent: delayed("facebook") }));
    jest.mock("../agents/googleShopping", () => ({ runGoogleShoppingAgent: delayed("google_shopping") }));
    jest.mock("../agents/stockx", () => ({ runStockXAgent: delayed("stockx") }));

    const { runPriceAgents } = await import("../agents/index");
    const start = Date.now();
    await runPriceAgents("test-uuid");
    const elapsed = Date.now() - start;

    // 5 agents × DELAY ms sequential = 400ms. Parallel should be ~DELAY ms.
    expect(elapsed).toBeLessThan(5 * DELAY);
  });

  test("9. fast_path_available true when StockX returns 3+ listings", async () => {
    const stockxSuccess = {
      source: "stockx",
      status: "success" as const,
      query_used: "test",
      listings: Array.from({ length: 5 }, (_, i) => ({ title: "Jordan", price: 200 + i, currency: "USD", source_detail: "StockX" })),
      metadata: { total_results_found: 5, data_type: "sold_price" as const, recency: "daily" as const, geographic_scope: "global" as const, source_weight: 0.95, caveats: [] },
    };
    jest.mock("../db/items", () => ({
      getItemById: jest.fn().mockResolvedValue({ id: "test-uuid", user_id: "u", name: "Nike Air Jordan 1", brand: "Nike", category: "Sneakers", condition: "used", description: null, year: null, status: null, sale_cost: null }),
    }));
    jest.mock("../agents/ebay", () => ({ runEbayAgent: jest.fn().mockResolvedValue(noData("ebay")) }));
    jest.mock("../agents/amazon", () => ({ runAmazonAgent: jest.fn().mockResolvedValue(noData("amazon")) }));
    jest.mock("../agents/facebook", () => ({ runFacebookAgent: jest.fn().mockResolvedValue(noData("facebook")) }));
    jest.mock("../agents/googleShopping", () => ({ runGoogleShoppingAgent: jest.fn().mockResolvedValue(noData("google_shopping")) }));
    jest.mock("../agents/stockx", () => ({ runStockXAgent: jest.fn().mockResolvedValue(stockxSuccess) }));

    const { runPriceAgents } = await import("../agents/index");
    const output = await runPriceAgents("test-uuid");
    expect(output.run_metadata.fast_path_available).toBe(true);
    expect(output.run_metadata.fast_path_source).toBe("stockx");
  });
});

import { AppraisalWriteInput, PriceAgentOutput } from "../types";

// Mock the pg pool before importing db modules
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn(() =>
  Promise.resolve({
    query: mockQuery,
    release: mockRelease,
  })
);

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    query: mockQuery,
  })),
}));

// Mock env vars required by db/client.ts
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_NAME = "testdb";
process.env.DB_USER = "testuser";
process.env.DB_PASSWORD = "testpass";
process.env.DB_SSL = "false";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAppraisalInput(): AppraisalWriteInput {
  const emptyOutput: PriceAgentOutput = {
    item: {
      item_id: "item-uuid",
      name: "Test Item",
      category: "general",
      keywords: [],
      is_streetwear_or_sneakers: false,
      sale_cost: null,
    },
    results: [],
    run_metadata: {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      agents_run: [],
      agents_skipped: [],
      agents_failed: [],
      total_listings_collected: 0,
      has_sufficient_data: false,
      fast_path_available: false,
      fast_path_source: null,
    },
  };

  return {
    item_id: "item-uuid",
    value_low: 50,
    value_mid: 75,
    value_high: 100,
    value_confidence: 0.8,
    volume_score: 0.6,
    reasonings: "Based on 10 eBay listings.",
    caveats: null,
    recommendation: "haggle",
    listing_references: [
      {
        url: "https://ebay.com/itm/123",
        source: "ebay",
        price: 75,
        condition: "used",
      },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getItemById", () => {
  beforeEach(() => jest.resetModules());

  test("1. returns null for an unknown item ID", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { getItemById } = await import("../db/items");
    const result = await getItemById("non-existent-uuid");
    expect(result).toBeNull();
  });
});

describe("writeAppraisal", () => {
  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  test("2. calls both appraisals insert and listing_references insert", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // INSERT INTO appraisals
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "appraisal-uuid" }] });
    // INSERT INTO listing_references (one row)
    mockQuery.mockResolvedValueOnce({});
    // UPDATE items SET status
    mockQuery.mockResolvedValueOnce({});
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const { writeAppraisal } = await import("../db/appraisals");
    const result = await writeAppraisal(makeAppraisalInput());

    expect(result.appraisal_id).toBe("appraisal-uuid");
    // BEGIN + appraisals INSERT + listing_references INSERT + items UPDATE + COMMIT = 5 calls
    expect(mockQuery).toHaveBeenCalledTimes(5);

    const calls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((sql) => sql.includes("INSERT INTO appraisals"))).toBe(true);
    expect(calls.some((sql) => sql.includes("INSERT INTO listing_reference"))).toBe(true);
    expect(calls.some((sql) => sql.includes("UPDATE items"))).toBe(true);
  });

  test("3. does not throw on DB failure — logs and returns empty appraisal_id", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // INSERT INTO appraisals — throws
    mockQuery.mockRejectedValueOnce(new Error("DB connection lost"));
    // ROLLBACK
    mockQuery.mockResolvedValueOnce({});

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { writeAppraisal } = await import("../db/appraisals");
    const result = await writeAppraisal(makeAppraisalInput());

    expect(result.appraisal_id).toBe("");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[writeAppraisal]"),
      expect.any(Object)
    );
    expect(mockRelease).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

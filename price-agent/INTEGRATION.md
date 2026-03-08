# Price-Agent Integration Guide

How to use the SnapSell price-agent and integrate it with your frontend, backend, and database. Written for developers who need to call the pipeline correctly and persist results.

---

## 1. What the price-agent does

1. **Takes an item** (name, brand, category, condition, year, description, optional asking price).
2. **Generates search queries** (one Gemini call) per marketplace.
3. **Runs five agents in parallel**: eBay, Amazon, Facebook Marketplace, Google Shopping, StockX (StockX only when category is sneakers/streetwear).
4. **Scores each listing** by relevance to your item (one Gemini call per source) so wrong variants/sizes are downweighted.
5. **Synthesizes an appraisal** (one Gemini call): value range (low/mid/high), confidence, recommendation (buy/haggle/pass), and reasoning.
6. **Optionally writes** the appraisal and listing references to the database and marks the item as appraised.

The agent is implemented in **Node.js/TypeScript**. Your backend can be Flask (Python) or anything else; you integrate by either calling the Node pipeline from the backend or exposing a small Node HTTP service that the backend calls.

---

## 2. Entry points (how to call it)

### From Node/TypeScript (same repo)

| Entry point | Use when | Input | Output |
|-------------|----------|--------|--------|
| `runPriceAgentsForItem(item: DbItem)` | You have a full item object (e.g. from CLI or from DB). | `DbItem` | `PriceAgentOutput` |
| `runPriceAgents(itemId: string)` | You have only an item ID; item is loaded from DB. | `item_id` | `PriceAgentOutput` |
| `synthesizeAppraisal(output: PriceAgentOutput)` | You have agent output and want the final appraisal. | `PriceAgentOutput` | `SynthesisResult` |
| `writeAppraisal(input: AppraisalWriteInput)` | You have the appraisal + refs and want to persist. | `AppraisalWriteInput` | `{ appraisal_id: string }` |

**Full pipeline (DB item → appraisal saved):**

```ts
import { runPriceAgents, synthesizeAppraisal } from "./agents/index";
import { writeAppraisal } from "./db/appraisals";
import type { AppraisalWriteInput, ListingReferenceWriteInput, DataType } from "./types";

// 1. Run agents (loads item from DB by id)
const output = await runPriceAgents(itemId);

// 2. Synthesize appraisal (Gemini or arithmetic fallback)
const appraisal = await synthesizeAppraisal(output);

// 3. Build write input and persist
const listing_references: ListingReferenceWriteInput[] = [];
for (const r of output.results) {
  if (r.status !== "success") continue;
  for (const l of r.listings) {
    listing_references.push({
      url: l.url ?? null,
      source: r.source,
      price: l.price,
      condition: l.condition ?? null,
      title: l.title ?? null,
      data_type: r.metadata.data_type,
    });
  }
}

const writeInput: AppraisalWriteInput = {
  item_id: output.item.item_id,
  value_low: appraisal.value_low,
  value_mid: appraisal.value_mid,
  value_high: appraisal.value_high,
  value_confidence: appraisal.value_confidence,
  volume_score: appraisal.volume_score,
  reasonings: appraisal.reasonings,
  caveats: appraisal.caveats,
  agents_used: output.run_metadata.agents_run,
  agents_failed: output.run_metadata.agents_failed,
  raw_agent_output: output,
  listing_references,
};

const { appraisal_id } = await writeAppraisal(writeInput);
```

**Without DB (e.g. CLI or “preview”):** Build a `DbItem` yourself, call `runPriceAgentsForItem(mockItem)`, then `synthesizeAppraisal(output)`. Do not call `writeAppraisal` if you are not persisting.

---

## 3. Data shapes you need

### Item (input)

- **DbItem** (what the pipeline expects):
  - `id`, `user_id`, `name` (required)
  - `description`, `condition`, `category`, `brand`, `year`, `status`, `sale_cost` (optional)
- **items** table must have columns matching these (see Database section below).

### Agent output (intermediate)

- **PriceAgentOutput**: `item` (ItemMetadata), `results` (array of AgentResult per source), `run_metadata` (timestamps, agents_run, agents_failed, total_listings_collected, has_sufficient_data, etc.).
- Each **AgentResult** has `source`, `status`, `query_used`, `listings` (array of { title, price, currency, url, condition, relevance_weight, … }), `metadata` (data_type, source_weight, caveats).

### Appraisal (output)

- **SynthesisResult** (what synthesis returns):
  - `value_low`, `value_mid`, `value_high` (numbers or null)
  - `value_confidence`, `volume_score` (0–1 or null)
  - `reasonings`, `caveats`, `recommendation`, `recommendation_reasoning`
- **AppraisalWriteInput** (what you pass to `writeAppraisal`): all of the above plus `item_id`, `agents_used`, `agents_failed`, `raw_agent_output` (the full PriceAgentOutput), and `listing_references` (array of { url, source, price, condition, title, data_type }).

### Recommendation

- **recommendation**: `"buy"` | `"haggle"` | `"pass"` | `"insufficient_data"`
- **recommendation_reasoning**: one sentence for the UI.
- Thresholds (in `types.ts`): BUY when value_mid ≥ 1.15 × asking; HAGGLE when ≥ 0.9 × asking; PASS when &lt; 0.9; insufficient_data when no asking price or confidence &lt; 0.35.

---

## 4. Database

The price-agent expects a **PostgreSQL** database and uses the same env vars as the rest of the app (see Environment below).

### Tables

**items**

- `id` (PK, uuid or text)
- `user_id` (text)
- `name` (text, required)
- `description`, `condition`, `category`, `brand` (text, nullable)
- `year` (integer, nullable)
- `status` (text, e.g. `pending`, `appraised`)
- `sale_cost` (numeric, nullable)

**appraisals**

- `id` (PK)
- `item_id` (FK → items.id)
- `value_low`, `value_mid`, `value_high`, `value_confidence`, `volume_score` (numeric, nullable)
- `reasonings` (text)
- `caveats` (text, nullable)
- `agents_used`, `agents_failed` (jsonb or text; stored as JSON arrays)
- `raw_agent_output` (jsonb or text; full PriceAgentOutput)
- `appraised_at` (timestamp; can be default now())

**listing_references**

- `id` (PK)
- `appraisal_id` (FK → appraisals.id)
- `url`, `source`, `condition`, `title` (text, nullable)
- `price` (numeric)
- `data_type` (text: `asking_price` | `sold_price` | `retail_price`)

`writeAppraisal` inserts one row into `appraisals`, N rows into `listing_references`, and sets `items.status = 'appraised'` for the item.

### Example schema (PostgreSQL)

```sql
CREATE TABLE items (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  description TEXT,
  condition  TEXT,
  category   TEXT,
  brand      TEXT,
  year       INTEGER,
  status     TEXT,
  sale_cost  NUMERIC
);

CREATE TABLE appraisals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           TEXT NOT NULL REFERENCES items(id),
  value_low         NUMERIC,
  value_mid         NUMERIC,
  value_high        NUMERIC,
  value_confidence  NUMERIC,
  volume_score      NUMERIC,
  reasonings        TEXT NOT NULL,
  caveats           TEXT,
  agents_used       JSONB NOT NULL,
  agents_failed     JSONB NOT NULL,
  raw_agent_output  JSONB NOT NULL,
  appraised_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE listing_references (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_id UUID NOT NULL REFERENCES appraisals(id),
  url          TEXT,
  source       TEXT NOT NULL,
  price        NUMERIC NOT NULL,
  condition    TEXT,
  title        TEXT,
  data_type    TEXT NOT NULL
);
```

---

## 5. Environment variables

Put these where the Node process runs (e.g. `SnapSell/.env` or `price-agent/.env`; the agent loads parent `.env` by default).

| Variable | Required for | Description |
|----------|----------------|-------------|
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay agent | Production or sandbox (sandbox IDs contain `SBX` and use sandbox URLs automatically). |
| `SERPAPI_KEY` | Amazon, Google Shopping | From serpapi.com. |
| `APIFY_API_KEY` | Facebook agent | Apify; 402 = billing/credits. |
| `KICKSDB_API_KEY` | StockX agent | From kicks.dev (Bearer token). |
| `GEMINI_API_KEY` | Query gen, listing weights, synthesis | Google AI; default model `gemini-2.5-flash` unless `GEMINI_MODEL` is set. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | DB reads/writes | Only needed when calling `getItemById` or `writeAppraisal`. |
| `DB_SSL` | Optional | Set to `true` for TLS. |

---

## 6. Integrating with a Flask (or other) backend

The price-agent is Node/TS. You have two main options.

### Option A: Backend calls Node as a subprocess or HTTP service

1. **Run the pipeline from Node** and expose a single endpoint (e.g. Express or Fastify) that:
   - Accepts `POST /appraise` with body `{ "item_id": "..." }` (or full item if you don’t use DB).
   - Calls `runPriceAgents(itemId)` (or `runPriceAgentsForItem(item)`), then `synthesizeAppraisal(output)`, then builds `AppraisalWriteInput` and calls `writeAppraisal(writeInput)`.
   - Returns `{ appraisal_id, recommendation, value_mid, ... }` (and whatever the frontend needs).

2. **Backend (Flask)** receives a request from the frontend (e.g. “Appraise item X”), calls the Node service (e.g. `requests.post("http://localhost:3001/appraise", json={"item_id": id})`), and returns the response to the frontend.

3. **Frontend** calls your backend (e.g. `POST /api/items/{id}/appraise`), then shows the returned appraisal and recommendation.

### Option B: Backend owns the DB; Node is invoked as a subprocess

1. **Backend** creates/updates the `items` row (with name, brand, category, etc.).
2. **Backend** spawns the Node script and passes `item_id` (e.g. via CLI arg or env), and the Node script:
   - Calls `runPriceAgents(itemId)`, `synthesizeAppraisal(output)`, builds `AppraisalWriteInput`, `writeAppraisal(writeInput)`.
   - Exits with 0 and optionally writes a small JSON result to stdout for the backend to parse.
3. **Backend** then reads the appraisal from the database (e.g. `SELECT * FROM appraisals WHERE item_id = ? ORDER BY appraised_at DESC LIMIT 1`) and returns it to the frontend.

In both options, the backend or Node must build `AppraisalWriteInput` from `PriceAgentOutput` + `SynthesisResult` as in the code sample in section 2 (listing_references flattened from `output.results[].listings`, agents_used/agents_failed from `output.run_metadata`).

### Example: minimal Node appraise API (Express)

You can add a small server in `price-agent` (e.g. `src/server.ts`) that your Flask app calls:

```ts
import express from "express";
import { runPriceAgents, synthesizeAppraisal } from "./agents/index";
import { writeAppraisal } from "./db/appraisals";
import type { AppraisalWriteInput, ListingReferenceWriteInput } from "./types";

const app = express();
app.use(express.json());

app.post("/appraise", async (req, res) => {
  const itemId = req.body.item_id as string;
  if (!itemId) return res.status(400).json({ error: "item_id required" });
  try {
    const output = await runPriceAgents(itemId);
    const appraisal = await synthesizeAppraisal(output);

    const listing_references: ListingReferenceWriteInput[] = [];
    for (const r of output.results) {
      if (r.status !== "success") continue;
      for (const l of r.listings) {
        listing_references.push({
          url: l.url ?? null,
          source: r.source,
          price: l.price,
          condition: l.condition ?? null,
          title: l.title ?? null,
          data_type: r.metadata.data_type,
        });
      }
    }

    const writeInput: AppraisalWriteInput = {
      item_id: output.item.item_id,
      value_low: appraisal.value_low,
      value_mid: appraisal.value_mid,
      value_high: appraisal.value_high,
      value_confidence: appraisal.value_confidence,
      volume_score: appraisal.volume_score,
      reasonings: appraisal.reasonings,
      caveats: appraisal.caveats,
      agents_used: output.run_metadata.agents_run,
      agents_failed: output.run_metadata.agents_failed,
      raw_agent_output: output,
      listing_references,
    };

    const { appraisal_id } = await writeAppraisal(writeInput);
    res.json({
      appraisal_id,
      recommendation: appraisal.recommendation,
      recommendation_reasoning: appraisal.recommendation_reasoning,
      value_low: appraisal.value_low,
      value_mid: appraisal.value_mid,
      value_high: appraisal.value_high,
      value_confidence: appraisal.value_confidence,
      reasonings: appraisal.reasonings,
      caveats: appraisal.caveats,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Appraisal failed" });
  }
});

app.listen(3001, () => console.log("Price-agent API on :3001"));
```

Flask then calls `POST http://localhost:3001/appraise` with `{"item_id": "..."}` and returns the JSON to the frontend.

---

## 7. Frontend

- **Trigger appraisal:** e.g. “Appraise” button that calls `POST /api/items/:id/appraise` (or whatever your backend exposes). Send the item id; backend runs the pipeline and writes the appraisal.
- **Show result:** load the latest appraisal for the item (from your API, which reads `appraisals` + `listing_references`). Display:
  - **value_low / value_mid / value_high** (e.g. “$80 – $95”)
  - **value_confidence** (e.g. “70% confidence”)
  - **recommendation** and **recommendation_reasoning** (buy/haggle/pass and one sentence)
  - **reasonings** (longer explanation)
  - **caveats** if present
- **Recommendation logic:** use the same thresholds as in `types.ts` (BUY_RATIO 1.15, HAGGLE_LOW 0.9) if you want to show badges or colors; the API can return `recommendation` and `recommendation_reasoning` so the frontend can display them as-is.

---

## 8. Running and testing locally

- **Install (price-agent):** `cd price-agent && npm install`
- **Env:** Ensure `SnapSell/.env` (or `price-agent/.env`) has at least `GEMINI_API_KEY` and any API keys for the agents you care about (e.g. eBay, SerpAPI).
- **CLI (no DB):** `npm run dev` or `npx ts-node src/cli.ts` — prompts for item fields, runs the full pipeline, prints appraisal (no write).
- **Synthesis test:** `npm run test:synthesis` — runs a minimal Gemini + parse test and a full `synthesizeAppraisal` test.
- **With DB:** Set `DB_*` and use `runPriceAgents(itemId)` and `writeAppraisal(...)` as in section 2.

---

## 9. Summary checklist for another developer

1. **Item shape:** Ensure every item has at least `id`, `user_id`, `name`; optional but useful: `brand`, `category`, `condition`, `year`, `description`, `sale_cost`, `status`.
2. **Pipeline order:** Run agents → synthesize → (optional) build `AppraisalWriteInput` → `writeAppraisal`.
3. **Listing references:** Build `listing_references` by iterating `output.results` and each `result.listings`, mapping to `{ url, source, price, condition, title, data_type }`.
4. **Backend:** Either call a small Node HTTP service that runs the pipeline and writes the appraisal, or spawn the Node script and then read the appraisal from the DB.
5. **Frontend:** Call backend to trigger appraisal; then load and display the appraisal (value range, confidence, recommendation, reasonings, caveats).
6. **Env:** Set `GEMINI_API_KEY` and any marketplace API keys; set `DB_*` if you use DB reads/writes.

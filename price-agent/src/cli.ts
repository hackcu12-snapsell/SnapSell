/**
 * SnapSell — Interactive Appraisal CLI
 *
 * Prompts for item details and runs a full appraisal with Gemini synthesis.
 * No database required — builds a mock DbItem directly.
 *
 * Usage: npx ts-node src/cli.ts
 * Debug: DEBUG_AGENT_OUTPUT=1 npx ts-node src/cli.ts
 */
import "./env";
import readline from "readline";
import { runPriceAgentsForItem, synthesizeAppraisal } from "./agents/index";
import { DbItem, AgentResult } from "./types";

// ─── Terminal helpers ──────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function hr(char = "─", width = 60) { return char.repeat(width); }
function fmt(label: string, value: string, width = 16) {
  return `  ${label.padEnd(width)} ${value}`;
}
function fmtPrice(n: number | null) {
  return n === null ? "—" : `$${n.toFixed(2)}`;
}

function spinner(label: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r  ${frames[i++ % frames.length]}  ${label}   `);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r" + " ".repeat(label.length + 10) + "\r");
  };
}

function agentStatusLine(result: AgentResult): string {
  const icons: Record<string, string> = {
    success: "OK  ", no_data: "NONE", error: "ERR ", skipped: "SKIP",
  };
  const icon = icons[result.status] ?? "??? ";
  const prices = result.listings.map((l) => l.price).filter((p) => p > 0);
  const range = prices.length > 0
    ? `  $${Math.min(...prices).toFixed(0)}–$${Math.max(...prices).toFixed(0)}`
    : "";
  const detail = result.status === "success"
    ? `${result.listings.length} listing${result.listings.length !== 1 ? "s" : ""}${range}`
    : result.error_message ?? result.status;
  const queryNote = result.query_used ? `  [q: "${result.query_used.slice(0, 40)}"]` : "";
  return `  [${icon}] ${result.source.padEnd(16)} ${detail}${queryNote}`;
}

// Fields the price agent uses (DbItem): name, brand, category, condition, year, description, sale_cost.
// id, user_id, status are set below for CLI-only runs (no DB).

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + hr("═"));
  console.log("  SnapSell — Appraisal Terminal (Gemini-powered)");
  console.log(hr("═"));
  console.log("  Enter all item fields the price agent expects. Optional = Enter to skip.\n");

  const name = await ask("  Item name (required):       ");
  if (!name) { console.log("  Item name is required."); rl.close(); return; }
  const brand = await ask("  Brand (optional):           ");
  const category = await ask("  Category (optional):        ");
  const condition = await ask("  Condition (optional):       ");
  const yearStr = await ask("  Year (optional):            ");
  const description = await ask("  Description (optional):     ");
  const priceStr = await ask("  Asking price $ (optional):  ");

  rl.close();

  const year      = yearStr ? parseInt(yearStr, 10) : null;
  const sale_cost = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, "")) : null;

  const mockItem: DbItem = {
    id: `cli-${Date.now()}`,
    user_id: "cli-user",
    name,
    brand: brand || null,
    category: category || null,
    condition: condition || null,
    description: description || null,
    year: year && !isNaN(year) ? year : null,
    status: "pending",
    sale_cost: sale_cost && !isNaN(sale_cost) ? sale_cost : null,
  };

  // ─── Item summary (all fields passed to price agent — no DB) ─────────────────
  console.log("\n" + hr());
  console.log("  Item (all price-agent fields)");
  console.log(hr());
  console.log(fmt("name:", mockItem.name));
  console.log(fmt("brand:", mockItem.brand ?? "—"));
  console.log(fmt("category:", mockItem.category ?? "—"));
  console.log(fmt("condition:", mockItem.condition ?? "—"));
  console.log(fmt("year:", mockItem.year != null ? String(mockItem.year) : "—"));
  console.log(fmt("description:", mockItem.description ? (mockItem.description.length > 55 ? mockItem.description.slice(0, 55) + "…" : mockItem.description) : "—"));
  console.log(fmt("sale_cost:", mockItem.sale_cost != null ? fmtPrice(mockItem.sale_cost) : "—"));
  console.log(fmt("id / status:", `${mockItem.id} / ${mockItem.status}`));

  // ─── Agent run ─────────────────────────────────────────────────────────────
  console.log("\n" + hr());
  console.log("  Step 1 — Market Data (Gemini query generation + agent fan-out)");
  console.log(hr());

  const stopAgents = spinner("Generating queries and querying markets...");
  let output;
  try {
    output = await runPriceAgentsForItem(mockItem);
  } catch (err) {
    stopAgents();
    console.error("\n  Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  stopAgents();

  for (const result of output.results) {
    console.log(agentStatusLine(result));
  }

  // Show listings per source so you can see what was found (eBay and others)
  console.log("\n" + hr());
  console.log("  Listings by source");
  console.log(hr());
  for (const result of output.results) {
    if (result.status !== "success" || result.listings.length === 0) continue;
    console.log(`\n  [${result.source}] (${result.listings.length})  query: "${(result.query_used ?? "").slice(0, 50)}"`);
    for (const l of result.listings.slice(0, 15)) {
      const title = l.title.length > 56 ? l.title.slice(0, 55) + "…" : l.title;
      const rel = l.relevance_weight != null ? ` rel=${l.relevance_weight}` : "";
      console.log(`    $${l.price.toFixed(2).padStart(8)}  ${title}${rel}`);
    }
    if (result.listings.length > 15) {
      console.log(`    ... and ${result.listings.length - 15} more`);
    }
  }

  const totalListings = output.run_metadata.total_listings_collected;
  console.log(`\n  ${totalListings} total listings collected across ${output.run_metadata.agents_run.length} source(s)`);
  if (!output.run_metadata.has_sufficient_data) {
    console.log("  WARNING: Insufficient data — appraisal may be unreliable.");
  }

  // ─── Gemini synthesis ──────────────────────────────────────────────────────
  console.log("\n" + hr());
  console.log("  Step 2 — Appraisal (Gemini synthesis)");
  console.log(hr());

  const stopSynth = spinner("Synthesizing appraisal with Gemini...");
  let appraisal;
  try {
    appraisal = await synthesizeAppraisal(output);
  } catch (err) {
    stopSynth();
    console.error("\n  Synthesis error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  stopSynth();

  if (appraisal.value_mid !== null) {
    console.log(fmt("Value (low):",  fmtPrice(appraisal.value_low)));
    console.log(fmt("Value (mid):",  fmtPrice(appraisal.value_mid)));
    console.log(fmt("Value (high):", fmtPrice(appraisal.value_high)));
    console.log(fmt("Confidence:",   ((appraisal.value_confidence ?? 0) * 100).toFixed(0) + "%"));
    console.log(fmt("Volume score:", ((appraisal.volume_score ?? 0) * 100).toFixed(0) + "%"));
  } else {
    console.log("  Insufficient data for a value estimate.");
  }

  if (mockItem.sale_cost) {
    console.log(fmt("Asking price:", fmtPrice(mockItem.sale_cost)));
  }

  console.log("\n" + hr());
  const rec = appraisal.recommendation.toUpperCase();
  console.log(`  Recommendation: ${rec}`);
  console.log(`  ${appraisal.recommendation_reasoning}`);

  console.log("\n" + hr());
  console.log("  Reasoning");
  console.log(hr());
  console.log("  " + appraisal.reasonings.replace(/\n/g, "\n  "));

  if (appraisal.caveats) {
    console.log("\n  Caveats: " + appraisal.caveats);
  }

  console.log("\n" + hr("═") + "\n");

  if (process.env.DEBUG_AGENT_OUTPUT === "1") {
    console.log("=== Raw Agent Output ===");
    console.log(JSON.stringify(output, null, 2));
    console.log("=== Synthesis Result ===");
    console.log(JSON.stringify(appraisal, null, 2));
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

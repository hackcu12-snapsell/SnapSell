import "./env";
import { getItemById } from "./db/items";
import { runPriceAgentsForItem, synthesizeAppraisal } from "./agents/index";
import { writeAppraisal } from "./db/appraisals";
import { AppraisalWriteInput } from "./types";

/**
 * Runs the full appraisal pipeline for an item and persists results to the DB.
 * Load item → run agents → synthesize → write appraisal + listing_references.
 *
 * Throws with statusCode 404 if item not found, or a plain Error on pipeline/DB failure.
 */
export async function handleAppraise(itemId: string): Promise<{ appraisal_id: string }> {
  const item = await getItemById(itemId);
  if (!item) {
    const err = new Error("Item not found");
    (err as NodeJS.ErrnoException).code = "404";
    throw err;
  }

  const agentOutput = await runPriceAgentsForItem(item);
  const synthesis = await synthesizeAppraisal(agentOutput);

  const listing_references = agentOutput.results
    .filter((r) => r.status === "success")
    .flatMap((r) =>
      r.listings.map((l) => ({
        url: l.url ?? null,
        source: r.source,
        price: l.price,
        condition: l.condition ?? null,
      }))
    );

  const writeInput: AppraisalWriteInput = {
    item_id: item.id,
    value_low: synthesis.value_low,
    value_mid: synthesis.value_mid,
    value_high: synthesis.value_high,
    value_confidence: synthesis.value_confidence,
    volume_score: synthesis.volume_score,
    reasonings: synthesis.reasonings,
    caveats: synthesis.caveats,
    recommendation: synthesis.recommendation,
    listing_references,
  };

  const { appraisal_id } = await writeAppraisal(writeInput);
  if (!appraisal_id) throw new Error("DB write failed");
  return { appraisal_id };
}

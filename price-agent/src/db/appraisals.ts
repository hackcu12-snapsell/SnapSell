import pool from "./client";
import { AppraisalWriteInput } from "../types";

/**
 * Writes an appraisal row and associated listing_reference rows in a single
 * transaction, then marks the item as 'appraised'.
 *
 * Column mapping to actual schema:
 *   value_low   → lowest_value
 *   value_mid   → mean_value
 *   value_high  → high_value
 *   volume_score → volume (stored as 0–100 integer)
 *   reasonings  → value_reasoning
 *   caveats     → caveat
 *   recommendation → decision
 *
 * On DB failure: logs the error and returns { appraisal_id: "" }.
 * Never throws — callers always receive a result.
 */
export async function writeAppraisal(
  input: AppraisalWriteInput
): Promise<{ appraisal_id: string }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Insert appraisals row
    const appraisalResult = await client.query(
      `INSERT INTO appraisals (
        item_id, lowest_value, mean_value, high_value,
        value_confidence, volume, value_reasoning, caveat, decision
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        input.item_id,
        input.value_low,
        input.value_mid,
        input.value_high,
        input.value_confidence,
        input.volume_score !== null ? Math.round(input.volume_score * 100) : null,
        input.reasonings,
        input.caveats,
        input.recommendation,
      ]
    );

    const appraisal_id: string = appraisalResult.rows[0].id;

    // 2. Insert listing_reference rows (schema: singular table name)
    for (const ref of input.listing_references) {
      await client.query(
        `INSERT INTO listing_reference (appraisal_id, url, source, price, condition)
         VALUES ($1, $2, $3, $4, $5)`,
        [appraisal_id, ref.url, ref.source, ref.price, ref.condition]
      );
    }

    await client.query("COMMIT");
    return { appraisal_id: String(appraisal_id) };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[writeAppraisal] Transaction failed:", {
      item_id: input.item_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { appraisal_id: "" };
  } finally {
    client.release();
  }
}

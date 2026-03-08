import pool from "./client";
import { AppraisalWriteInput } from "../types";

/**
 * Writes an appraisal row, associated listing_references rows, and updates
 * the item status — all in a single transaction.
 *
 * On DB failure: logs full input for replay and returns { appraisal_id: "" }.
 * Never throws — the synthesis layer always receives a result.
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
        item_id, value_low, value_mid, value_high, value_confidence,
        volume_score, reasonings, caveats, agents_used, agents_failed,
        raw_agent_output
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        input.item_id,
        input.value_low,
        input.value_mid,
        input.value_high,
        input.value_confidence,
        input.volume_score,
        input.reasonings,
        input.caveats,
        JSON.stringify(input.agents_used),
        JSON.stringify(input.agents_failed),
        JSON.stringify(input.raw_agent_output),
      ]
    );

    const appraisal_id: string = appraisalResult.rows[0].id;

    // 2. Insert listing_references rows
    for (const ref of input.listing_references) {
      await client.query(
        `INSERT INTO listing_references (appraisal_id, url, source, price, condition, title, data_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          appraisal_id,
          ref.url,
          ref.source,
          ref.price,
          ref.condition,
          ref.title,
          ref.data_type,
        ]
      );
    }

    // 3. Update item status to appraised
    await client.query(
      "UPDATE items SET status = 'appraised' WHERE id = $1",
      [input.item_id]
    );

    await client.query("COMMIT");
    return { appraisal_id };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[writeAppraisal] Transaction failed. Full input logged for replay:", {
      item_id: input.item_id,
      error: err instanceof Error ? err.message : String(err),
      input,
    });
    return { appraisal_id: "" };
  } finally {
    client.release();
  }
}

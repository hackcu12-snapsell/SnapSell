import { query } from "./client";
import { DbItem } from "../types";

export async function getItemById(id: string): Promise<DbItem | null> {
  const result = await query("SELECT * FROM items WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: String(row.id),
    user_id: String(row.userid),  // schema column is 'userid'
    name: row.name,
    description: row.description ?? null,
    condition: row.condition ?? null,
    category: row.category ?? null,
    brand: row.brand ?? null,
    year: row.year ? parseInt(row.year, 10) : null,
    status: row.status ?? null,
    sale_cost: row.sale_cost !== null ? parseFloat(row.sale_cost) : null,
  };
}

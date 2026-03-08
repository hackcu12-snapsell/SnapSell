/**
 * Load .env from parent SnapSell directory first, then from cwd.
 * Use this so that running from price-agent/ still picks up SnapSell/.env.
 */
import path from "path";
import { config } from "dotenv";

const parentEnv = path.resolve(__dirname, "..", "..", ".env");
config({ path: parentEnv });
config(); // cwd .env if present (e.g. price-agent/.env override)

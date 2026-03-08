import "dotenv/config";
import { Pool, QueryResult } from "pg";

// Pool is created lazily on first query so that importing this module
// does not throw when DB env vars are absent (e.g. in the CLI demo flow).
let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;

  const requiredVars = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  const useSSL = process.env.DB_SSL === "true";
  _pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT!, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });
  return _pool;
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  return getPool().query(text, params);
}

// Lazy proxy — exposes the same surface as a Pool without eagerly connecting.
const lazyPool = {
  query: (text: string, params?: unknown[]) => getPool().query(text, params),
  connect: () => getPool().connect(),
  end: () => _pool?.end() ?? Promise.resolve(),
};

export default lazyPool;

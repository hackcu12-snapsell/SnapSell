/**
 * Price-agent HTTP server.
 * Exposes POST /appraise { item_id } → { appraisal_id }.
 *
 * Start: npx ts-node src/server.ts
 * Default port: 3001 (override with PRICE_AGENT_PORT env var).
 */
import "./env";
import http from "http";
import { handleAppraise } from "./appraise";

const PORT = parseInt(process.env.PRICE_AGENT_PORT ?? "3001", 10);

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/appraise") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { item_id } = JSON.parse(body) as { item_id?: string };
      if (!item_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "item_id required" }));
        return;
      }

      const result = await handleAppraise(item_id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      const is404 = err instanceof Error && (err as NodeJS.ErrnoException).code === "404";
      const status = is404 ? 404 : 500;
      const message = err instanceof Error ? err.message : "Internal error";
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[price-agent] Server listening on port ${PORT}`);
});

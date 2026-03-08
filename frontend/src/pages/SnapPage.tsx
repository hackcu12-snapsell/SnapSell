/** @module SnapPage */

import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { toggleModal } from "../redux/actions/modalActions";
import { API_URL } from "../data/constants";

type RawItem = {
  status?: string;
  price?: number | null;
  sale_cost?: number | null;
  mean_value?: number | null;
  name?: string;
  category?: string | null;
  posted_date?: string | null;
  last_price_change_date?: string | null;
};

type Stats = {
  inventory: number;
  listed: number;
  sold: number;
  portfolioValue: number;
  revenue: number;
  staleListed: number;
  readyToList: number;
  sellThroughRate: number;
  topCategories: { name: string; count: number }[];
};

const EMPTY_STATS: Stats = {
  inventory: 0, listed: 0, sold: 0,
  portfolioValue: 0, revenue: 0,
  staleListed: 0, readyToList: 0,
  sellThroughRate: 0,
  topCategories: [],
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function isStale(item: RawItem): boolean {
  if (item.status !== "listed") return false;
  const now = Date.now();
  const anchor = item.last_price_change_date ?? item.posted_date;
  if (!anchor) return false;
  return now - new Date(anchor).getTime() > TWO_WEEKS_MS;
}

function computeStats(items: RawItem[]): Stats {
  const s = { ...EMPTY_STATS, topCategories: [] as { name: string; count: number }[] };
  const catMap: Record<string, number> = {};

  items.forEach(item => {
    const val = Number(item.mean_value ?? item.price ?? item.sale_cost ?? 0);
    const st = item.status ?? "inventory";

    if (st === "inventory") {
      s.inventory++;
      s.portfolioValue += val;
      if (val > 0) s.readyToList++;
    } else if (st === "listed") {
      s.listed++;
      s.portfolioValue += val;
      if (isStale(item)) s.staleListed++;
    } else if (st === "sold") {
      s.sold++;
      s.revenue += val;
    }

    if (item.category && st !== "sold") {
      catMap[item.category] = (catMap[item.category] ?? 0) + 1;
    }
  });

  const total = s.inventory + s.listed + s.sold;
  s.sellThroughRate = total > 0 ? Math.round((s.sold / total) * 100) : 0;
  s.topCategories = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return s;
}

const SnapPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loginResult = useAppSelector(state => state.userState.loginResult);
  const tokenFromStore = (loginResult as Record<string, unknown> | null)?.token as string | undefined;
  const token = tokenFromStore || (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").token; } catch { return null; }
  })();
  const username = (loginResult as Record<string, unknown> | null)?.username as string | undefined;

  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/items`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then((res: unknown) => {
        console.log("[SnapPage] /items response:", res);
        let raw: RawItem[] = [];
        if (Array.isArray(res)) raw = res as RawItem[];
        else if (res && typeof res === "object" && "items" in res) {
          const r = (res as Record<string, unknown>).items;
          if (Array.isArray(r)) raw = r as RawItem[];
        }
        setStats(computeStats(raw));
        setLoaded(true);
      })
      .catch(err => { console.error("[SnapPage] items fetch failed:", err); setLoaded(true); });
  }, [token]);

  const fmtVal = (n: number) =>
    n === 0 ? "$0" : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

  const total = stats.inventory + stats.listed + stats.sold;

  return (
    <div style={s.page}>

      {/* ── Hero ── */}
      <div style={s.hero}>
        <p style={s.eyebrow}>{username ? `Hey, ${username}.` : "Welcome back."}</p>
        <h1 style={s.headline}>What are you selling today?</h1>
        <button style={s.snapBtn} onClick={() => dispatch(toggleModal("addItemModal"))}>
          <span style={s.plus}>+</span>
          Snap an Item
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div style={s.statsRow}>
        <StatCard label="Inventory" value={loaded ? String(stats.inventory) : "—"} />
        <StatCard label="Listed" value={loaded ? String(stats.listed) : "—"} />
        <StatCard label="Sold" value={loaded ? String(stats.sold) : "—"} />
        <StatCard label="Portfolio" value={loaded ? fmtVal(stats.portfolioValue) : "—"} highlight />
        <StatCard label="Revenue" value={loaded ? fmtVal(stats.revenue) : "—"} />
      </div>

      {/* ── Insights ── */}
      {loaded && total > 0 && (
        <div style={s.section}>
          <p style={s.sectionLabel}>Insights</p>
          <div style={s.insightGrid}>

            {/* Sell-through rate */}
            <div className="landing-card" style={s.insightCard}>
              <div style={s.insightHeader}>
                <span style={s.insightTitle}>Sell-through rate</span>
                <span style={s.insightBig}>{stats.sellThroughRate}%</span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width: `${stats.sellThroughRate}%` }} />
              </div>
              <p style={s.insightSub}>
                {stats.sold} of {total} items sold
              </p>
            </div>

            {/* Inventory health */}
            <div className="landing-card" style={s.insightCard}>
              <div style={s.insightHeader}>
                <span style={s.insightTitle}>Inventory health</span>
              </div>
              <div style={s.healthRow}>
                <HealthStat
                  value={stats.readyToList}
                  label="appraised"
                  color="#4ade80"
                />
                <HealthStat
                  value={stats.staleListed}
                  label="stale (2wk+)"
                  color="#f59e0b"
                />
                <HealthStat
                  value={stats.listed}
                  label="live on eBay"
                  color="#60a5fa"
                />
              </div>
            </div>

            {/* Top categories — only if we have any */}
            {stats.topCategories.length > 0 && (
              <div className="landing-card" style={s.insightCard}>
                <span style={s.insightTitle}>Top categories</span>
                <div style={s.catList}>
                  {stats.topCategories.map(c => (
                    <div key={c.name} style={s.catRow}>
                      <span style={s.catName}>{c.name}</span>
                      <span style={s.catCount}>{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Inventory CTA ── */}
      <div style={s.section}>
        <p style={s.sectionLabel}>Your Inventory</p>
        <button className="btn-secondary" style={s.inventoryBtn} onClick={() => navigate("/collection")}>
          View all items →
        </button>
      </div>

    </div>
  );
};

const StatCard = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div style={{ ...s.statCard, ...(highlight ? s.statHighlight : {}) }}>
    <div style={{ ...s.statValue, ...(highlight ? s.statValueHighlight : {}) }}>{value}</div>
    <div style={s.statLabel}>{label}</div>
  </div>
);

const HealthStat = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <div style={s.healthItem}>
    <span style={{ ...s.healthValue, color }}>{value}</span>
    <span style={s.healthLabel}>{label}</span>
  </div>
);

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: "680px",
    margin: "0 auto",
    padding: "48px 24px 80px",
    display: "flex",
    flexDirection: "column",
    gap: "44px",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  eyebrow: { fontSize: "0.85rem", color: "#666", margin: 0 },
  headline: {
    fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    lineHeight: 1.2,
  },
  snapBtn: {
    marginTop: "6px",
    alignSelf: "flex-start" as CSSProperties["alignSelf"],
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    background: "#fff",
    color: "#111",
    border: "none",
    borderRadius: "10px",
    padding: "13px 26px",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  plus: { fontSize: "1.3rem", fontWeight: 300, lineHeight: 1 },

  // stats
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "10px",
  },
  statCard: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "14px 10px",
    textAlign: "center",
  },
  statHighlight: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.18)",
  },
  statValue: {
    fontSize: "1.35rem",
    fontWeight: 700,
    color: "#bbb",
    lineHeight: 1,
    marginBottom: "5px",
  },
  statValueHighlight: { color: "#fff", fontSize: "1.5rem" },
  statLabel: {
    fontSize: "0.68rem",
    color: "#555",
    textTransform: "uppercase" as CSSProperties["textTransform"],
    letterSpacing: "0.07em",
  },

  // sections
  section: { display: "flex", flexDirection: "column", gap: "12px" },
  sectionLabel: {
    fontSize: "0.7rem",
    color: "#555",
    textTransform: "uppercase" as CSSProperties["textTransform"],
    letterSpacing: "0.1em",
    margin: 0,
  },

  // insights
  insightGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "12px",
  },
  insightCard: {
    // background/border/borderRadius/padding come from .landing-card
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  insightHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  insightTitle: { fontSize: "0.82rem", color: "#888" },
  insightBig: { fontSize: "1.6rem", fontWeight: 700, color: "#fff" },
  insightSub: { fontSize: "0.75rem", color: "#555", margin: 0 },

  barTrack: {
    height: "4px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "2px",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "#4ade80",
    borderRadius: "2px",
    transition: "width 0.6s ease",
    minWidth: "2px",
  },

  healthRow: { display: "flex", gap: "16px" },
  healthItem: { display: "flex", flexDirection: "column", gap: "3px" },
  healthValue: { fontSize: "1.3rem", fontWeight: 700, lineHeight: 1 },
  healthLabel: { fontSize: "0.7rem", color: "#555" },

  catList: { display: "flex", flexDirection: "column", gap: "8px" },
  catRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catName: { fontSize: "0.85rem", color: "#bbb" },
  catCount: {
    fontSize: "0.78rem",
    color: "#555",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "4px",
    padding: "1px 7px",
  },

  inventoryBtn: {
    // base styles come from .btn-secondary
    flex: "unset",
    alignSelf: "flex-start" as CSSProperties["alignSelf"],
  },
};

export default SnapPage;

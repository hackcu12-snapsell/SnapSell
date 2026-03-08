
/** @module AppraisalModal */

import React, { useEffect, useState, type CSSProperties } from "react";
import { useAppSelector } from "../redux/hooks";
import Modal from "../common/Modal/Modal";
import { getItemImageUrl } from "../data/constants";

const MODAL_ID = "appraisalModal";

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"] as const;

type Condition = (typeof CONDITIONS)[number];

type Decision = "buy" | "pass" | "haggle" | "not_enough_info";

type AppraisalValues = {
  lowest_value?: number;
  mean_value?: number;
  high_value?: number;
  value_confidence?: number;
  volume?: number;
  value_reasoning?: string;
  decision?: string;
};

const DECISION_CONFIG: Record<Decision, { label: string; color: string; bg: string }> = {
  buy:              { label: "Buy",              color: "#22c55e", bg: "rgba(34,197,94,0.13)"  },
  pass:             { label: "Pass",             color: "#ef4444", bg: "rgba(239,68,68,0.13)"  },
  haggle:           { label: "Haggle",           color: "#f59e0b", bg: "rgba(245,158,11,0.13)" },
  not_enough_info:  { label: "Not Enough Info",  color: "#888",    bg: "rgba(136,136,136,0.1)" },
};

function decisionMessage(d: Decision, meanValue?: number): string {
  const val = meanValue != null ? `$${Math.round(meanValue)}` : "an unknown amount";
  switch (d) {
    case "buy":
      return `Appraised at ${val} — comparable sales are strong. This item should sell well at or near market rate.`;
    case "pass":
      return `Appraised at ${val} — market demand appears low or the category is oversaturated. Consider adjusting your price or timing.`;
    case "haggle":
      return `Appraised at ${val} — pricing is competitive. You may need to negotiate or price slightly below mean to move it quickly.`;
    default:
      return "We couldn't find enough comparable sales to make a confident recommendation for this item.";
  }
}

type AppraisalData = {
  item_id?: number;
  preview?: string;
  image_url?: string;
  condition?: string;
  item?: {
    name?: string;
    description?: string;
    brand?: string;
  };
  appraisal?: AppraisalValues;
  preflight?: {
    category_id?: string;
    missing_specifics?: string[];
    suggestions?: Record<string, string>;
  };
};

type AppraisalModalProps = {
  handleClose: (modalId: string) => void;
  data?: AppraisalData | null;
};

const fmt = (val: unknown) => (val != null && typeof val === "number" ? `$${val.toFixed(0)}` : "—");
const pct = (val: unknown) =>
  val != null && typeof val === "number" ? `${Math.round(val * 100)}%` : "—";

const AppraisalModal: React.FC<AppraisalModalProps> = ({ handleClose, data }) => {
  const isOpen = useAppSelector(state => Boolean(state.modalState[MODAL_ID]));
  const tokenFromStore = useAppSelector(state => state.userState.loginResult?.token);
  const token =
    tokenFromStore ||
    (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "{}").token;
      } catch {
        return null;
      }
    })();

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<Condition>("Good");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  // Missing item specifics required by eBay
  const [missingSpecifics, setMissingSpecifics] = useState<string[]>([]);
  const [specificValues, setSpecificValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && data) {
      // TODO: thinking that we should be using redux or forms for this stuff
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(data.item?.name ?? "");
      setDesc(data.item?.description ?? "");
      setPrice(
        typeof data.appraisal?.mean_value === "number"
          ? String(Math.round(data.appraisal.mean_value))
          : ""
      );
      setCondition((data.condition as Condition) ?? "Good");
      setError(null);
      setPosting(false);

      // Pre-populate specifics from preflight
      const missing = data.preflight?.missing_specifics ?? [];
      const suggestions = data.preflight?.suggestions ?? {};
      setMissingSpecifics(missing);
      const initial: Record<string, string> = {};
      missing.forEach(f => {
        initial[f] = suggestions[f] ?? (f === "Brand" ? (data.item?.brand ?? "") : "");
      });
      setSpecificValues(initial);
    }
  }, [isOpen, data]);

  const close = () => handleClose(MODAL_ID);

  const handleKeep = async () => {
    if (data?.item_id) {
      try {
        await fetch(`/api/items/${data.item_id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "inventory" }),
        });
      } catch (err) {
        console.error("[AppraisalModal] Failed to update status:", err);
      }
    }
    close();
  };

  const setSpecific = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSpecificValues(v => ({ ...v, [key]: e.target.value }));

  // Pre-fill known specifics from item data
  const buildSpecifics = (): Record<string, string> => {
    const out: Record<string, string> = { ...specificValues };
    if (data?.item?.brand && !out["Brand"]) out["Brand"] = data.item.brand;
    return out;
  };

  const handlePost = async () => {
    if (!price.trim() || !title.trim()) return;
    setPosting(true);
    setError(null);
    const specifics = buildSpecifics();
    console.log("[AppraisalModal] specificValues:", specificValues);
    console.log("[AppraisalModal] item_specifics being sent:", specifics);
    try {
      const res = await fetch("/api/list-on-ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          item_id: data?.item_id,
          title,
          description: desc,
          price: parseFloat(price),
          condition,
          item_specifics: specifics,
          category_id: data?.preflight?.category_id ?? null
        })
      });

      const result = (await res.json()) as Record<string, unknown>;

      const missing = result.missing_specifics;

      if (res.status === 409 && Array.isArray(missing) && missing.length > 0) {
        const known = buildSpecifics();
        const initial: Record<string, string> = {};

        missing.forEach(f => {
          initial[f] = known[f] || "";
        });

        setSpecificValues(initial);
        setMissingSpecifics(missing);
        setPosting(false);
        return;
      }

      if (!res.ok) {
        setError((result?.error as string) ?? "Listing failed");
        setPosting(false);
        return;
      }

      console.log("[AppraisalModal] Listed on eBay:", result.listing_url);
      close();
    } catch {
      setError("Network error — try again");
      setPosting(false);
    }
  };

  const appr = data?.appraisal;
  const titleEl = (
    <div style={styles.titleRow}>
      <span>{data?.item?.name ?? "Appraisal"}</span>
      <button style={styles.closeX} onClick={close} aria-label="Close">
        ✕
      </button>
    </div>
  );

  const footerButtons = [
    {
      text: "Keep in Inventory",
      variant: "outlined" as const,
      onClick: handleKeep,
      disabled: posting,
      secondary: true
    },
    {
      text: posting ? "Posting…" : "Post to eBay",
      variant: "contained" as const,
      primary: true,
      disabled: posting || !price.trim() || !title.trim(),
      onClick: handlePost
    }
  ];

  return (
    <Modal
      modal_id={MODAL_ID}
      title={titleEl}
      style={{ maxWidth: "480px", width: "100%" }}
      footerButtons={footerButtons}
    >
      {(data?.preview || data?.image_url) && (
        <div style={styles.imageWrap}>
          <img
            src={data.preview ?? getItemImageUrl(data?.image_url)}
            alt="item"
            style={styles.image}
          />
          {data.condition && <span style={styles.conditionBadge}>{data.condition}</span>}
        </div>
      )}

      {appr ? (
        <>
          <div style={styles.valRow}>
            <div style={styles.valCard}>
              <div style={styles.valNum}>{fmt(appr.lowest_value)}</div>
              <div style={styles.valLabel}>Low</div>
            </div>
            <div style={{ ...styles.valCard, ...styles.valCardMid }}>
              <div style={{ ...styles.valNum, ...styles.valNumMid }}>{fmt(appr.mean_value)}</div>
              <div style={styles.valLabel}>Mean</div>
            </div>
            <div style={styles.valCard}>
              <div style={styles.valNum}>{fmt(appr.high_value)}</div>
              <div style={styles.valLabel}>High</div>
            </div>
          </div>
          <div style={styles.metaRow}>
            <span>{pct(appr.value_confidence)} confidence</span>
            {appr.volume != null && <span>·</span>}
            {appr.volume != null && <span>{appr.volume} comparable sales</span>}
          </div>
          {appr.value_reasoning && <p style={styles.reasoning}>{appr.value_reasoning}</p>}

          {/* ── Decision bar ── */}
          {appr.decision && (() => {
            const key = (appr.decision as string).toLowerCase() as Decision;
            const cfg = DECISION_CONFIG[key] ?? DECISION_CONFIG.not_enough_info;
            const msg = decisionMessage(key, appr.mean_value);
            return (
              <div style={{ ...styles.decisionBar, background: cfg.bg, borderColor: cfg.color + "44" }}>
                <span style={{ ...styles.decisionLabel, color: cfg.color }}>{cfg.label}</span>
                <span
                  style={styles.decisionInfoWrap}
                  onMouseEnter={() => setTooltipOpen(true)}
                  onMouseLeave={() => setTooltipOpen(false)}
                >
                  <span style={styles.decisionInfoIcon}>ⓘ</span>
                  {tooltipOpen && <span style={styles.decisionTooltip}>{msg}</span>}
                </span>
              </div>
            );
          })()}
        </>
      ) : (
        <p style={styles.noAppraisal}>Appraisal unavailable</p>
      )}

      <div style={styles.divider} />

      <p style={styles.sectionLabel}>Listing Details</p>

      <label style={styles.fieldLabel}>
        Title
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={80}
          style={styles.input}
        />
      </label>

      <label style={styles.fieldLabel}>
        Description
        <textarea
          rows={3}
          value={desc}
          onChange={e => setDesc(e.target.value)}
          style={styles.textarea}
        />
      </label>

      <div style={styles.twoCol}>
        <label style={styles.fieldLabel}>
          Purchase Price ($)
          <input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={e => setPrice(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.fieldLabel}>
          Condition
          <select
            value={condition}
            onChange={e => setCondition(e.target.value as Condition)}
            style={styles.select}
          >
            {CONDITIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {missingSpecifics.length > 0 && (
        <div style={styles.specificsBox}>
          <p style={styles.specificsLabel}>eBay requires these fields to list:</p>
          {missingSpecifics.map(field => (
            <label key={field} style={styles.fieldLabel}>
              {field}
              <input
                value={specificValues[field] || ""}
                onChange={setSpecific(field)}
                placeholder={`Enter ${field}`}
                style={styles.input}
              />
            </label>
          ))}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </Modal>
  );
};

const styles: Record<string, CSSProperties> = {
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%"
  },
  closeX: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "1.1rem",
    color: "#999",
    padding: "2px 4px",
    borderRadius: "4px"
  },
  imageWrap: {
    position: "relative",
    width: "100%",
    height: "140px",
    borderRadius: "8px",
    overflow: "hidden",
    marginBottom: "16px"
  },
  image: { width: "100%", height: "100%", objectFit: "cover" },
  conditionBadge: {
    position: "absolute",
    bottom: "8px",
    right: "8px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "0.78rem",
    padding: "3px 8px",
    borderRadius: "4px",
    backdropFilter: "blur(4px)"
  },
  valRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "8px"
  },
  valCard: {
    flex: 1,
    textAlign: "center",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "8px",
    padding: "10px 0"
  },
  valCardMid: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)"
  },
  valNum: { fontSize: "1.2rem", fontWeight: 600, color: "#ccc" },
  valNumMid: { fontSize: "1.5rem", color: "#fff" },
  valLabel: {
    fontSize: "0.72rem",
    color: "#666",
    marginTop: "2px",
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  },
  metaRow: {
    display: "flex",
    gap: "6px",
    fontSize: "0.78rem",
    color: "#888",
    justifyContent: "center",
    marginBottom: "10px"
  },
  reasoning: {
    fontSize: "0.82rem",
    color: "#aaa",
    lineHeight: 1.5,
    margin: "0 0 12px",
    borderLeft: "2px solid rgba(255,255,255,0.1)",
    paddingLeft: "10px"
  },
  noAppraisal: { color: "#666", fontSize: "0.85rem", textAlign: "center", margin: "12px 0" },
  divider: { borderTop: "1px solid rgba(255,255,255,0.1)", margin: "14px 0" },
  sectionLabel: {
    fontSize: "0.75rem",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: "0 0 12px"
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "0.82rem",
    color: "#fff",
    marginBottom: "12px"
  },
  input: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "0.95rem",
    padding: "8px",
    width: "100%",
    fontFamily: "inherit",
    boxSizing: "border-box"
  },
  textarea: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "0.95rem",
    padding: "8px",
    fontFamily: "inherit",
    resize: "vertical"
  },
  select: {
    background: "#2a2a2a",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "0.95rem",
    padding: "8px",
    width: "100%",
    fontFamily: "inherit",
    cursor: "pointer"
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  specificsBox: {
    background: "rgba(255,200,50,0.07)",
    border: "1px solid rgba(255,200,50,0.25)",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "12px"
  },
  specificsLabel: {
    fontSize: "0.78rem",
    color: "#f5c842",
    margin: "0 0 10px",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  error: { color: "#ff6b6b", fontSize: "0.82rem", margin: "0" },
  decisionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: "8px",
    border: "1px solid",
    padding: "9px 12px",
    marginTop: "10px",
    marginBottom: "2px"
  },
  decisionLabel: {
    fontWeight: 600,
    fontSize: "0.85rem",
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const
  },
  decisionInfoWrap: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    cursor: "default"
  },
  decisionInfoIcon: {
    fontSize: "0.95rem",
    color: "#888",
    lineHeight: 1,
    userSelect: "none" as const
  },
  decisionTooltip: {
    position: "absolute" as const,
    right: 0,
    bottom: "calc(100% + 8px)",
    width: "220px",
    background: "#1e1e1e",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "0.78rem",
    color: "#ccc",
    lineHeight: 1.5,
    zIndex: 20,
    pointerEvents: "none" as const,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)"
  }
};

export default AppraisalModal;

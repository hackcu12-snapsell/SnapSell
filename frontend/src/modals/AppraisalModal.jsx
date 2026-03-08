import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Modal from "../common/Modal/Modal";

const MODAL_ID = "appraisalModal";

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

const fmt = val => (val != null ? `$${Number(val).toFixed(0)}` : "—");
const pct = val => (val != null ? `${Math.round(val * 100)}%` : "—");

const AppraisalModal = ({ handleClose, data }) => {
  const isOpen = useSelector(state => state.modalState[MODAL_ID]);
  const tokenFromStore = useSelector(state => state.userState.loginResult?.token);
  const token = tokenFromStore || (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").token; } catch { return null; }
  })();

  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [price, setPrice]       = useState("");
  const [condition, setCondition] = useState("Good");
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState(null);

  // Populate fields when modal opens with new data
  useEffect(() => {
    if (isOpen && data) {
      setTitle(data.item?.name || "");
      setDesc(data.item?.description || "");
      setPrice(data.appraisal?.mean_value ? String(Math.round(data.appraisal.mean_value)) : "");
      setCondition(data.condition || "Good");
      setError(null);
      setPosting(false);
    }
  }, [isOpen, data]);

  const close = () => handleClose(MODAL_ID);

  const handleKeep = () => close();

  const handlePost = async () => {
    if (!price || !title) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/list-on-ebay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          item_id:     data.item_id,
          title,
          description: desc,
          price:       parseFloat(price),
          condition,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Listing failed");
        setPosting(false);
        return;
      }
      console.log("[AppraisalModal] Listed on eBay:", result.listing_url);
      close();
    } catch (err) {
      setError("Network error — try again");
      setPosting(false);
    }
  };

  const appr = data?.appraisal;
  const titleEl = (
    <div style={styles.titleRow}>
      <span>{data?.item?.name || "Appraisal"}</span>
      <button style={styles.closeX} onClick={close} aria-label="Close">✕</button>
    </div>
  );

  const footerButtons = [
    {
      text: "Keep in Inventory",
      variant: "outlined",
      onClick: handleKeep,
      disabled: posting,
      secondary: true,
    },
    {
      text: posting ? "Posting…" : "Post to eBay",
      variant: "contained",
      primary: true,
      disabled: posting || !price.trim() || !title.trim(),
      onClick: handlePost,
    },
  ];

  return (
    <Modal
      modal_id={MODAL_ID}
      title={titleEl}
      style={{ maxWidth: "480px", width: "100%" }}
      footerButtons={footerButtons}
      footerJustify="space-between"
    >
      {/* Image + condition */}
      {(data?.preview || data?.image_url) && (
        <div style={styles.imageWrap}>
          <img
            src={data.preview || data.image_url}
            alt="item"
            style={styles.image}
          />
          {data.condition && (
            <span style={styles.conditionBadge}>{data.condition}</span>
          )}
        </div>
      )}

      {/* Appraisal values */}
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
          {appr.value_reasoning && (
            <p style={styles.reasoning}>{appr.value_reasoning}</p>
          )}
        </>
      ) : (
        <p style={styles.noAppraisal}>Appraisal unavailable</p>
      )}

      <div style={styles.divider} />

      {/* Editable listing fields */}
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
          List Price ($)
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
            onChange={e => setCondition(e.target.value)}
            style={styles.select}
          >
            {CONDITIONS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </Modal>
  );
};

const styles = {
  titleRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%"
  },
  closeX: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "1.1rem", color: "#999", padding: "2px 4px", borderRadius: "4px"
  },
  imageWrap: {
    position: "relative", width: "100%", height: "140px",
    borderRadius: "8px", overflow: "hidden", marginBottom: "16px"
  },
  image: { width: "100%", height: "100%", objectFit: "cover" },
  conditionBadge: {
    position: "absolute", bottom: "8px", right: "8px",
    background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "0.78rem",
    padding: "3px 8px", borderRadius: "4px", backdropFilter: "blur(4px)"
  },
  valRow: {
    display: "flex", gap: "10px", marginBottom: "8px"
  },
  valCard: {
    flex: 1, textAlign: "center",
    background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "10px 0"
  },
  valCardMid: {
    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)"
  },
  valNum: { fontSize: "1.2rem", fontWeight: 600, color: "#ccc" },
  valNumMid: { fontSize: "1.5rem", color: "#fff" },
  valLabel: { fontSize: "0.72rem", color: "#666", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" },
  metaRow: {
    display: "flex", gap: "6px", fontSize: "0.78rem", color: "#888",
    justifyContent: "center", marginBottom: "10px"
  },
  reasoning: {
    fontSize: "0.82rem", color: "#aaa", lineHeight: 1.5,
    margin: "0 0 12px", borderLeft: "2px solid rgba(255,255,255,0.1)", paddingLeft: "10px"
  },
  noAppraisal: { color: "#666", fontSize: "0.85rem", textAlign: "center", margin: "12px 0" },
  divider: { borderTop: "1px solid rgba(255,255,255,0.1)", margin: "14px 0" },
  sectionLabel: { fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" },
  fieldLabel: {
    display: "flex", flexDirection: "column", gap: "4px",
    fontSize: "0.82rem", color: "#fff", marginBottom: "12px"
  },
  input: {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px", color: "#fff", fontSize: "0.95rem", padding: "8px",
    width: "100%", fontFamily: "inherit", boxSizing: "border-box"
  },
  textarea: {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px", color: "#fff", fontSize: "0.95rem", padding: "8px",
    fontFamily: "inherit", resize: "vertical"
  },
  select: {
    background: "#2a2a2a", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px", color: "#fff", fontSize: "0.95rem", padding: "8px",
    width: "100%", fontFamily: "inherit", cursor: "pointer"
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  error: { color: "#ff6b6b", fontSize: "0.82rem", margin: "0" }
};

export default AppraisalModal;

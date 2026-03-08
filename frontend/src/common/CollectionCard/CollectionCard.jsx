/** @module CollectionCard */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import "./CollectionCard.css";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function isStale(item) {
  if (item.status !== "listed") return false;
  const anchor = item.lastPriceChangeDate ?? item.postedDate;
  if (!anchor) return false;
  return Date.now() - new Date(anchor).getTime() > TWO_WEEKS_MS;
}

const CollectionCard = ({ item, to, onRevisePrice }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef(null);
  const popoverRef = useRef(null);

  const stale = isStale(item);
  const listingPrice = item.listingPrice ?? 0;
  const purchasePrice = item.purchasePrice ?? 0;
  const suggestedPrice = Math.max(
    parseFloat((listingPrice * 0.95).toFixed(2)),
    purchasePrice
  );
  const canDrop = listingPrice > 0 && suggestedPrice < listingPrice;

  // Close on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = e => {
      const inBadge = badgeRef.current?.contains(e.target);
      const inPopover = popoverRef.current?.contains(e.target);
      if (!inBadge && !inPopover) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const handleBadgeClick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (!popoverOpen && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 6, left: rect.right - 240 });
    }
    setPopoverOpen(o => !o);
  };

  const handleApply = async e => {
    e.preventDefault();
    e.stopPropagation();
    if (!onRevisePrice || !canDrop || applying) return;
    setApplying(true);
    await onRevisePrice(item.id, suggestedPrice);
    setApplying(false);
    setPopoverOpen(false);
  };

  const popover = popoverOpen && createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: popoverPos.top,
        left: popoverPos.left,
        width: "240px",
        background: "#1e1e1e",
        border: "1px solid rgba(255,200,50,0.35)",
        borderRadius: "10px",
        padding: "14px",
        fontSize: "0.8rem",
        color: "#ccc",
        lineHeight: 1.6,
        zIndex: 9999,
        boxShadow: "0 6px 24px rgba(0,0,0,0.7)"
      }}
    >
      <p style={{ margin: "0 0 8px", color: "#f5c842", fontWeight: 700, fontSize: "0.85rem" }}>
        Stale listing
      </p>
      <p style={{ margin: "0 0 10px" }}>
        Listed for over 2 weeks with no price change. A price drop can help attract buyers.
      </p>
      {canDrop ? (
        <>
          <p style={{ margin: "0 0 10px" }}>
            Suggested:{" "}
            <strong style={{ color: "#fff" }}>${suggestedPrice.toFixed(2)}</strong>
            {" "}(−5% from ${listingPrice.toFixed(2)})
          </p>
          <button
            onClick={handleApply}
            disabled={applying}
            style={{
              width: "100%", padding: "8px", borderRadius: "6px",
              background: "#f59e0b", border: "none", color: "#000",
              fontWeight: 700, fontSize: "0.82rem", cursor: applying ? "default" : "pointer"
            }}
          >
            {applying ? "Applying…" : "Apply Price Drop"}
          </button>
        </>
      ) : (
        <p style={{ margin: 0, color: "#888", fontStyle: "italic" }}>
          Cannot drop below purchase price (${purchasePrice.toFixed(2)}).
        </p>
      )}
    </div>,
    document.body
  );

  const alertBadge = stale && (
    <>
      <div
        ref={badgeRef}
        onClick={handleBadgeClick}
        style={{
          position: "absolute", top: "8px", right: "8px", zIndex: 10,
          width: "22px", height: "22px", borderRadius: "50%",
          background: "#f59e0b", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "13px", fontWeight: 700,
          color: "#000", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.4)"
        }}
      >!
      </div>
      {popover}
    </>
  );

  const cardContent = (
    <>
      <div className="collection-card-image-wrapper" style={{ position: "relative" }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="collection-card-image" />
        ) : (
          <div className="collection-card-placeholder">No image</div>
        )}
        {alertBadge}
      </div>

      <div className="collection-card-footer">
        <span
          className="collection-card-name"
          title={item.price != null ? `${item.name} • $${item.price.toLocaleString()}` : item.name}
        >
          {item.name}
          {item.price != null && ` • $${item.price.toLocaleString()}`}
        </span>
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="collection-card-link">
        <div className="collection-card">{cardContent}</div>
      </Link>
    );
  }

  return <div className="collection-card">{cardContent}</div>;
};

export default CollectionCard;

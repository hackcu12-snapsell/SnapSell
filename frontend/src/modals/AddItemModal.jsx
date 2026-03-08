/** @module AddItemModal */

import React, { useRef, useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Modal from "../common/Modal/Modal";

const MODAL_ID = "addItemModal";

const EMPTY_FIELDS = { name: "", description: "", category: "", brand: "", year: "" };

const AddItemModal = ({ handleClose, onAppraisalReady }) => {
  const isOpen = useSelector(state => state.modalState[MODAL_ID]);
  const tokenFromStore = useSelector(state => state.userState.loginResult?.token);
  // Fallback to localStorage in case Redux hasn't rehydrated yet
  const token =
    tokenFromStore ||
    (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "{}").token;
      } catch {
        return null;
      }
    })();

  const [mode, setMode] = useState("photo");
  // stage: "capture" | "review" | "saving"
  const [stage, setStage] = useState("capture");

  const [cameraActive, setCameraActive] = useState(false);
  const [capturedFile, setCapturedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Review stage fields
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [condition, setCondition] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && mode === "photo" && stage === "capture" && !capturedFile) {
      startCamera();
    }
    if (!isOpen) stopCamera();
  }, [isOpen]);

  // Assign stream once video element is mounted (MUI Dialog lazy-mounts children)
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setCameraError("Camera access denied. Upload a photo instead.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      setCapturedFile(file);
      setPreview(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg");
  };

  const handleUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setCapturedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const resetCapture = () => {
    stopCamera();
    setCapturedFile(null);
    setPreview(null);
    setCameraError(null);
    startCamera();
  };

  const close = () => {
    stopCamera();
    setCapturedFile(null);
    setPreview(null);
    setCameraError(null);
    setDescription("");
    setPurchasePrice("");
    setStage("capture");
    setFields(EMPTY_FIELDS);
    setCondition("");
    setMode("photo");
    handleClose(MODAL_ID);
  };

  const handleAnalyze = async () => {
    if (!capturedFile) return;
    setAnalyzing(true);
    const body = new FormData();
    body.append("image", capturedFile);
    if (description.trim()) body.append("description", description.trim());
    try {
      const res = await fetch("/api/analyze-item", { method: "POST", body });
      const data = await res.json();
      const parsed = {
        name: data.name || "",
        description: data.description || description,
        category: data.category || "",
        brand: data.brand || "",
        year: data.year || ""
      };
      setFields(parsed);
      setCondition(data.condition || "");

      if (data.needs_review) {
        setStage("review");
      } else {
        // Confident identification — skip review and save immediately
        await handleSave(parsed);
      }
    } catch (err) {
      console.error("[AddItemModal] Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async (overrideFields = null) => {
    const saveFields = overrideFields || fields;
    if (!capturedFile || !saveFields.name.trim()) return;
    setStage("saving");
    const body = new FormData();
    body.append("image", capturedFile);
    body.append("name", saveFields.name.trim());
    body.append("description", (saveFields.description || "").trim());
    body.append("category", (saveFields.category || "").trim());
    body.append("brand", (saveFields.brand || "").trim());
    body.append("year", (saveFields.year || "").toString().trim());
    body.append("purchase_price", purchasePrice || "0");
    try {
      const res = await fetch("/api/save-item", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[AddItemModal] Save failed:", data);
        setStage("review");
        return;
      }
      console.log("[AddItemModal] Saved item:", data.item_id, "| image:", data.image_url);
      onAppraisalReady?.({
        item_id: data.item_id,
        image_url: data.image_url,
        preview,
        condition,
        item: data.item,
        appraisal: data.appraisal
      });
      close();
    } catch (err) {
      console.error("[AddItemModal] Save error:", err);
      setStage("review");
    }
  };

  const setField = key => e => setFields(f => ({ ...f, [key]: e.target.value }));

  // ── Footer buttons ──────────────────────────────────────────────────────────
  const footerButtons =
    stage === "capture"
      ? [
          {
            text: analyzing ? "Analyzing…" : "Analyze Item",
            variant: "contained",
            primary: true,
            disabled: !capturedFile || analyzing,
            onClick: handleAnalyze
          }
        ]
      : [
          {
            text: stage === "saving" ? "Saving…" : "Save & Appraise",
            variant: "contained",
            primary: true,
            disabled: !fields.name.trim() || stage === "saving",
            onClick: handleSave
          }
        ];

  const titleEl = (
    <div style={styles.titleRow}>
      <span>{stage === "review" ? "Review Item" : "Add Item"}</span>
      <button style={styles.closeX} onClick={close} aria-label="Close">
        ✕
      </button>
    </div>
  );

  return (
    <Modal
      modal_id={MODAL_ID}
      title={titleEl}
      style={{ maxWidth: "390px", width: "100%" }}
      footerButtons={footerButtons}
    >
      {/* Mode toggle — only visible on capture stage */}
      {stage === "capture" && (
        <div style={styles.toggleTrack}>
          <div
            style={{ ...styles.togglePill, left: mode === "photo" ? "4px" : "calc(50% + 0px)" }}
          />
          <button style={styles.toggleBtn} onClick={() => setMode("photo")}>
            <span
              style={{ position: "relative", zIndex: 1, color: mode === "photo" ? "#111" : "#aaa" }}
            >
              Photo
            </span>
          </button>
          <button style={styles.toggleBtn} onClick={() => setMode("manual")}>
            <span
              style={{
                position: "relative",
                zIndex: 1,
                color: mode === "manual" ? "#111" : "#aaa"
              }}
            >
              Manual
            </span>
          </button>
        </div>
      )}

      {/* ── CAPTURE STAGE ── */}
      {stage === "capture" && mode === "photo" && (
        <>
          <div style={styles.viewfinder}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ ...styles.viewfinderMedia, display: cameraActive ? "block" : "none" }}
            />
            {preview && !cameraActive && (
              <img src={preview} alt="preview" style={styles.viewfinderMedia} />
            )}
            {!cameraActive && !preview && cameraError && (
              <span style={styles.viewfinderPlaceholder}>{cameraError}</span>
            )}
            {cameraActive && (
              <button style={styles.shutterBtn} onClick={capturePhoto} aria-label="Capture" />
            )}
            {preview && !cameraActive && (
              <button style={styles.retakeBtn} onClick={resetCapture}>
                Retake
              </button>
            )}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          <div style={styles.uploadRow}>
            <button style={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
              Upload Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
          </div>

          <label style={styles.fieldLabel}>
            Description
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any extra details about the item..."
              style={styles.textarea}
            />
          </label>

          <label style={styles.fieldLabel}>
            Purchase Price ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              placeholder="0.00"
              style={styles.input}
            />
          </label>
        </>
      )}

      {stage === "capture" && mode === "manual" && (
        <div style={styles.manualPlaceholder}>Manual entry coming soon.</div>
      )}

      {/* ── REVIEW STAGE ── */}
      {(stage === "review" || stage === "saving") && (
        <>
          {preview && (
            <div style={styles.reviewPreviewRow}>
              <img src={preview} alt="item" style={styles.reviewPreview} />
              {condition && <span style={styles.conditionBadge}>{condition}</span>}
            </div>
          )}

          <label style={styles.fieldLabel}>
            Name <span style={styles.required}>*</span>
            <input
              value={fields.name}
              onChange={setField("name")}
              placeholder="Item name"
              style={{ ...styles.input, ...(fields.name.trim() ? {} : styles.inputError) }}
            />
          </label>

          <label style={styles.fieldLabel}>
            Description
            <textarea
              rows={3}
              value={fields.description}
              onChange={setField("description")}
              placeholder="Description"
              style={styles.textarea}
            />
          </label>

          <div style={styles.twoCol}>
            <label style={styles.fieldLabel}>
              Category
              <input
                value={fields.category}
                onChange={setField("category")}
                placeholder="e.g. Electronics"
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              Year
              <input
                value={fields.year}
                onChange={setField("year")}
                placeholder="e.g. 2019"
                style={styles.input}
              />
            </label>
          </div>

          <label style={styles.fieldLabel}>
            Brand
            <input
              value={fields.brand}
              onChange={setField("brand")}
              placeholder="Brand or manufacturer"
              style={styles.input}
            />
          </label>
        </>
      )}
    </Modal>
  );
};

const styles = {
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
    lineHeight: 1,
    padding: "2px 4px",
    borderRadius: "4px"
  },
  toggleTrack: {
    position: "relative",
    display: "flex",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    padding: "4px",
    marginBottom: "14px"
  },
  togglePill: {
    position: "absolute",
    top: "4px",
    bottom: "4px",
    width: "calc(50% - 4px)",
    background: "rgba(255,255,255,0.88)",
    borderRadius: "6px",
    transition: "left 0.2s ease",
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)"
  },
  toggleBtn: {
    flex: 1,
    background: "none",
    border: "none",
    padding: "6px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontFamily: "inherit",
    borderRadius: "6px"
  },
  viewfinder: {
    position: "relative",
    width: "100%",
    aspectRatio: "4/3",
    background: "#1e1e1e",
    borderRadius: "10px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px"
  },
  viewfinderMedia: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  viewfinderPlaceholder: {
    color: "#777",
    fontSize: "0.9rem",
    textAlign: "center",
    padding: "0 16px"
  },
  shutterBtn: {
    position: "absolute",
    bottom: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "58px",
    height: "58px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    border: "3px solid rgba(255,255,255,0.9)",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
  },
  retakeBtn: {
    position: "absolute",
    bottom: "10px",
    right: "10px",
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "6px",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "0.82rem",
    backdropFilter: "blur(4px)"
  },
  uploadRow: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "14px"
  },
  uploadBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    color: "#ccc",
    padding: "5px 16px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontFamily: "inherit"
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "0.82rem",
    color: "#fff",
    marginBottom: "12px"
  },
  required: {
    color: "#ff6b6b"
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
  inputError: {
    border: "1px solid #ff6b6b"
  },
  reviewPreviewRow: {
    position: "relative",
    marginBottom: "14px",
    borderRadius: "8px",
    overflow: "hidden",
    height: "120px"
  },
  reviewPreview: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
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
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px"
  },
  manualPlaceholder: {
    padding: "40px 0",
    textAlign: "center",
    color: "#777"
  }
};

export default AddItemModal;

/** @module AddItemModal */

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppSelector } from "../redux/hooks";
import Modal from "../common/Modal/Modal";
import LoadingScreen from "../common/LoadingScreen";
import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";

const MODAL_ID = "addItemModal";

type AddItemModalProps = {
  handleClose: (modalId: string) => void;
  onAppraisalReady?: (data: AppraisalReadyData) => void;
};

type AppraisalReadyData = {
  item_id: number;
  image_url?: string;
  preview?: string;
  condition?: string;
  item?: { name?: string; description?: string; brand?: string };
  appraisal?: Record<string, unknown>;
  preflight?: {
    category_id?: string;
    missing_specifics?: string[];
    suggestions?: Record<string, string>;
  };
};

type Mode = "photo" | "manual";

type Stage = "capture" | "review" | "saving";

type FieldValues = {
  name: string;
  description: string;
  category: string;
  brand: string;
  year: string;
  condition: string;
};

const EMPTY_FIELDS: FieldValues = {
  name: "",
  description: "",
  category: "",
  brand: "",
  year: "",
  condition: ""
};

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"] as const;

const AddItemModal: React.FC<AddItemModalProps> = ({ handleClose, onAppraisalReady }) => {
  const isOpen = useAppSelector(state => Boolean(state.modalState[MODAL_ID]));
  const tokenFromStore = useAppSelector(state => state.userState.loginResult?.token);
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

  const [mode, setMode] = useState<Mode>("photo");
  const [stage, setStage] = useState<Stage>("capture");

  const [cameraActive, setCameraActive] = useState(false);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [fields, setFields] = useState<FieldValues>(EMPTY_FIELDS);
  const [condition, setCondition] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start camera when photo tab is active and capture stage; stop when switching away or closing
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    if (mode === "photo" && stage === "capture" && !capturedFile) {
      startCamera();
      return;
    }
    stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, stage, capturedFile]);

  // Assign stream to video element when it mounts (e.g. after switching back to photo tab)
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
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      setCapturedFile(file);
      setPreview(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg");
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
    setListPrice("");
    setStage("capture");
    setFields(EMPTY_FIELDS);
    setCondition("");
    setSaveError(null);
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
      const data = (await res.json()) as Record<string, unknown>;
      const parsed = {
        name: typeof data.name === "string" ? data.name : "",
        description: typeof data.description === "string" ? data.description : description,
        category: typeof data.category === "string" ? data.category : "",
        brand: typeof data.brand === "string" ? data.brand : "",
        year: typeof data.year === "string" ? data.year : "",
        condition: typeof data.condition === "string" ? data.condition : ""
      };
      setFields(parsed);
      setCondition(typeof data.condition === "string" ? data.condition : "");

      if (data.needs_review) {
        setStage("review");
      } else {
        await handleSave(parsed);
      }
    } catch (err) {
      console.error("[AddItemModal] Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async (overrideFields: FieldValues | null = null) => {
    const saveFields = overrideFields || fields;
    if (!saveFields.name.trim()) return;
    setSaveError(null);
    setStage("saving");
    const body = new FormData();
    if (capturedFile) body.append("image", capturedFile);
    body.append("name", saveFields.name.trim());
    body.append("description", (saveFields.description || "").trim());
    body.append("category", (saveFields.category || "").trim());
    body.append("brand", (saveFields.brand || "").trim());
    body.append("year", (saveFields.year || "").toString().trim());
    body.append("purchase_price", purchasePrice || "0");
    body.append("list_price", listPrice || "0");
    body.append("condition", condition || "Good");

    try {
      const res = await fetch("/api/save-item", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        console.error("[AddItemModal] Save failed:", data);
        const msg = (data?.error as string) || "Save failed. Please try again.";
        setSaveError(msg);
        setStage(mode === "manual" ? "capture" : "review");
        return;
      }

      const itemId = typeof data.item_id === "number" ? data.item_id : undefined;
      const imageUrl = typeof data.image_url === "string" ? data.image_url : undefined;

      onAppraisalReady?.({
        item_id: itemId ?? 0,
        image_url: imageUrl,
        preview: preview ?? undefined,
        condition,
        item: (data.item as Record<string, unknown>) ?? undefined,
        appraisal: (data.appraisal as Record<string, unknown>) ?? undefined,
        preflight: (data.preflight as AppraisalReadyData["preflight"]) ?? undefined
      });
      close();
    } catch (err) {
      console.error("[AddItemModal] Save error:", err);
      setSaveError("Network error. Please try again.");
      setStage(mode === "manual" ? "capture" : "review");
    }
  };

  const setField =
    (key: keyof FieldValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setFields(prev => ({ ...prev, [key]: value }));
    };

  // ── Footer buttons ──────────────────────────────────────────────────────────
  const footerButtons =
    stage === "capture"
      ? mode === "photo"
        ? [
            {
              text: analyzing ? "Analyzing…" : "Analyze Item",
              variant: "contained" as const,
              primary: true,
              disabled: !capturedFile || analyzing,
              onClick: handleAnalyze
            }
          ]
        : [
            {
              text: "Analyze Item",
              variant: "contained" as const,
              primary: true,
              disabled: !fields.name.trim(),
              onClick: () => handleSave(null)
            }
          ]
      : [
          {
            text: stage === "saving" ? "Saving…" : "Save & Appraise",
            variant: "contained" as const,
            primary: true,
            disabled: !fields.name.trim() || stage === "saving",
            onClick: () => handleSave(null)
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

  const isLoading = analyzing || stage === "saving";

  return (
    <Modal
      modal_id={MODAL_ID}
      title={titleEl}
      style={{ maxWidth: "390px", width: "100%" }}
      footerButtons={footerButtons}
    >
      {isLoading ? (
        /* Fixed-size box so the modal never grows/shrinks during animation */
        <div style={{ position: "relative", height: "280px", overflow: "hidden" }}>
          <LoadingScreen contained backgroundColor="#1c1c1e" />
        </div>
      ) : (
        <>
          {/* Mode toggle — only visible on capture stage */}
          {stage === "capture" && (
            <div style={styles.toggleTrack}>
              <div
                style={{ ...styles.togglePill, left: mode === "photo" ? "4px" : "calc(50% + 0px)" }}
              />
              <button style={styles.toggleBtn} onClick={() => setMode("photo")}>
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: mode === "photo" ? "#111" : "#aaa"
                  }}
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
                List Price ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={listPrice}
                  onChange={e => setListPrice(e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                />
              </label>
            </>
          )}

          {stage === "capture" && mode === "manual" && (
            <>
              <label style={styles.fieldLabel}>
                <span>
                  Name <span style={styles.required}>*</span>
                </span>
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
                  rows={2}
                  value={fields.description}
                  onChange={setField("description")}
                  placeholder="Any extra details about the item..."
                  style={styles.textarea}
                />
              </label>

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
                Brand
                <input
                  value={fields.brand}
                  onChange={setField("brand")}
                  placeholder="Brand or manufacturer"
                  style={styles.input}
                />
              </label>

              <div style={styles.twoCol}>
                <label style={styles.fieldLabel}>
                  Year
                  <input
                    value={fields.year}
                    onChange={setField("year")}
                    placeholder="e.g. 2019"
                    style={styles.input}
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
              </div>

              <FormControl fullWidth size="small" sx={{ marginTop: 1 }}>
                <InputLabel id="condition-select-label">Condition</InputLabel>
                <Select
                  labelId="condition-select-label"
                  value={condition || "Good"}
                  label="Condition"
                  onChange={(event: SelectChangeEvent<string>) => setCondition(event.target.value)}
                  sx={{
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 1,
                    color: "#fff",
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center"
                    }
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: "rgba(0,0,0,0.8)",
                        color: "#fff",
                        mt: 1,
                        border: "1px solid rgba(255,255,255,0.15)",
                        boxShadow: "0 6px 16px rgba(0,0,0,0.45)"
                      }
                    },
                    MenuListProps: {
                      sx: {
                        "& .MuiMenuItem-root": {
                          color: "#fff"
                        },
                        "& .MuiMenuItem-root:hover": {
                          backgroundColor: "rgba(255,255,255,0.12)"
                        }
                      }
                    }
                  }}
                >
                  {CONDITIONS.map(c => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {saveError && <p style={styles.saveError}>{saveError}</p>}
            </>
          )}

          {/* ── REVIEW STAGE ── */}
          {stage === "review" && (
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

              <label style={styles.fieldLabel}>
                Condition
                <input
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                  placeholder="e.g. Good, Like New, Fair"
                  style={styles.input}
                />
              </label>

              <label style={styles.fieldLabel}>
                List Price ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={listPrice}
                  onChange={e => setListPrice(e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                />
              </label>
            </>
          )}
        </>
      )}
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
    marginTop: "14px",
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
  select: {
    /* Windows uses its own dropdown rendering; keep text readable on white backgrounds. */
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    color: "#000",
    fontSize: "0.95rem",
    padding: "8px",
    width: "100%",
    fontFamily: "inherit",
    boxSizing: "border-box",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none"
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
  saveError: {
    color: "#ff6b6b",
    fontSize: "0.85rem",
    margin: "8px 0 0"
  }
};

export default AddItemModal;

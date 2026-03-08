import React, { useRef, useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Modal from "../common/Modal/Modal";

const MODAL_ID = "addItemModal";

const AddItemModal = ({ handleClose }) => {
  const isOpen = useSelector(state => state.modalState[MODAL_ID]);

  const [mode, setMode] = useState("photo");
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedFile, setCapturedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-open camera when modal opens in photo mode
  useEffect(() => {
    if (isOpen && mode === "photo" && !capturedFile) {
      startCamera();
    }
    if (!isOpen) stopCamera();
  }, [isOpen]);

  // MUI Dialog lazy-mounts children: assign stream once video element is in the DOM
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

  const reset = () => {
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
    setMode("photo");
    handleClose(MODAL_ID);
  };

  const handleSubmit = async () => {
    if (!capturedFile) return;
    setLoading(true);
    const body = new FormData();
    body.append("image", capturedFile);
    if (description.trim()) body.append("description", description.trim());
    try {
      const res = await fetch("/api/analyze-item", { method: "POST", body });
      const data = await res.json();
      console.log("[AddItemModal] analyze-item result:", data);
      console.log("[AddItemModal] purchase price:", purchasePrice);
    } catch (err) {
      console.error("[AddItemModal] Analysis failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const titleEl = (
    <div style={styles.titleRow}>
      <span>Add Item</span>
      <button style={styles.closeX} onClick={close} aria-label="Close">✕</button>
    </div>
  );

  const footerButtons = [
    {
      text: loading ? "Analyzing…" : "Analyze Item",
      variant: "contained",
      onClick: handleSubmit,
      disabled: !capturedFile || loading,
      primary: true
    }
  ];

  return (
    <Modal
      modal_id={MODAL_ID}
      title={titleEl}
      style={{ maxWidth: "390px", width: "100%" }}
      footerButtons={footerButtons}
    >
      {/* Sliding pill toggle */}
      <div style={styles.toggleTrack}>
        <div
          style={{
            ...styles.togglePill,
            left: mode === "photo" ? "4px" : "calc(50% + 0px)"
          }}
        />
        <button
          style={styles.toggleBtn}
          onClick={() => setMode("photo")}
        >
          <span style={{ position: "relative", zIndex: 1, color: mode === "photo" ? "#111" : "#aaa" }}>
            Photo
          </span>
        </button>
        <button
          style={styles.toggleBtn}
          onClick={() => setMode("manual")}
        >
          <span style={{ position: "relative", zIndex: 1, color: mode === "manual" ? "#111" : "#aaa" }}>
            Manual
          </span>
        </button>
      </div>

      {mode === "photo" && (
        <>
          {/* Viewfinder */}
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

            {/* Shutter button overlaid on live feed */}
            {cameraActive && (
              <button style={styles.shutterBtn} onClick={capturePhoto} aria-label="Capture" />
            )}

            {/* Retake overlay on preview */}
            {preview && !cameraActive && (
              <button style={styles.retakeBtn} onClick={reset}>Retake</button>
            )}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Upload button */}
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

          {/* Description */}
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

          {/* Purchase price */}
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

      {mode === "manual" && (
        <div style={styles.manualPlaceholder}>
          Manual entry coming soon.
        </div>
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
    borderRadius: "4px",
    transition: "color 0.15s"
  },
  toggleTrack: {
    position: "relative",
    display: "flex",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    padding: "4px",
    marginBottom: "14px",
    gap: 0
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
  shutterInner: {},
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
  manualPlaceholder: {
    padding: "40px 0",
    textAlign: "center",
    color: "#777"
  }
};

export default AddItemModal;

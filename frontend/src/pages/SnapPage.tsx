import { useRef, useState } from "react";
import "../App.css";

type ItemInfo = {
  name: string;
  description: string;
  condition: string;
  category: string;
  brand: string | null;
  year: string | null;
  is_shoe: boolean;
  is_collectible: boolean;
};

type Stage = "upload" | "loading" | "confirm" | "done";

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

export default function SnapPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ItemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }

  async function analyze() {
    if (!imageFile) return;
    setStage("loading");
    setError(null);

    const body = new FormData();
    body.append("image", imageFile);

    try {
      const res = await fetch("/api/analyze-item", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setInfo(data);
      setStage("confirm");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("upload");
    }
  }

  function handleChange(field: keyof ItemInfo, value: string) {
    setInfo((prev) => (prev ? { ...prev, [field]: value || null } : prev));
  }

  function confirm() {
    console.log("Confirmed item:", info);
    setStage("done");
  }

  function reset() {
    setStage("upload");
    setPreview(null);
    setImageFile(null);
    setInfo(null);
    setError(null);
  }

  return (
    <div className="app">
      <h1>SnapSell</h1>
      <p className="subtitle">Photograph an item to get an instant appraisal</p>

      {stage === "upload" && (
        <div className="upload-section">
          <div
            className="dropzone"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {preview ? (
              <img src={preview} alt="preview" className="preview-img" />
            ) : (
              <span>
                Drop a photo here or <u>browse</u>
              </span>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {error && <p className="error">{error}</p>}
          {imageFile && (
            <button className="btn-primary" onClick={analyze}>
              Analyze Item
            </button>
          )}
        </div>
      )}

      {stage === "loading" && (
        <div className="loading-section">
          {preview && <img src={preview} alt="preview" className="preview-img" />}
          <div className="spinner" />
          <p>Analyzing with Gemini...</p>
        </div>
      )}

      {stage === "confirm" && info && (
        <div className="confirm-section">
          {preview && (
            <img src={preview} alt="preview" className="preview-img small" />
          )}
          <h2>Confirm Item Details</h2>
          <p className="hint">Review and edit the AI's findings before continuing.</p>

          <div className="form">
            <label>
              Name
              <input
                value={info.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </label>

            <label>
              Description
              <textarea
                rows={3}
                value={info.description}
                onChange={(e) => handleChange("description", e.target.value)}
              />
            </label>

            <label>
              Condition
              <select
                value={info.condition}
                onChange={(e) => handleChange("condition", e.target.value)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>

            <label>
              Category
              <input
                value={info.category}
                onChange={(e) => handleChange("category", e.target.value)}
              />
            </label>

            <label>
              Brand
              <input
                value={info.brand ?? ""}
                placeholder="Unknown"
                onChange={(e) => handleChange("brand", e.target.value)}
              />
            </label>

            <label>
              Year / Era
              <input
                value={info.year ?? ""}
                placeholder="Unknown"
                onChange={(e) => handleChange("year", e.target.value)}
              />
            </label>
          </div>

          <div className="actions">
            <button className="btn-secondary" onClick={reset}>
              Start Over
            </button>
            <button className="btn-primary" onClick={confirm}>
              Confirm & Continue
            </button>
          </div>
        </div>
      )}

      {stage === "done" && info && (
        <div className="done-section">
          <h2>✓ Item Saved</h2>
          <pre>{JSON.stringify(info, null, 2)}</pre>
          <button className="btn-primary" onClick={reset}>
            Analyze Another
          </button>
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from "react";

const STATUS_LABEL = {
  required: "Required",
  uploading: "Uploading",
  uploaded: "Uploaded",
  failed: "Upload failed",
};

const STATUS_CLASS = {
  required: "doc-status doc-status-required",
  uploading: "doc-status doc-status-uploading",
  uploaded: "doc-status doc-status-uploaded",
  failed: "doc-status doc-status-failed",
};

export default function DocumentUploadCard({
  label,
  description,
  acceptedFormatsText,
  maxSizeMb,
  document,
  progress,
  error,
  disabled,
  onUpload,
  onRemove,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const uploading = typeof progress === "number" && progress < 100;
  const uploaded = !!document && !uploading;
  const state = error ? "failed" : uploading ? "uploading" : uploaded ? "uploaded" : "required";

  function pickFile(files) {
    const file = files?.[0];
    if (file) onUpload(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    pickFile(e.dataTransfer.files);
  }

  return (
    <div className="doc-card">
      <div className="doc-card-head">
        <div>
          <h3 className="doc-card-title">{label}</h3>
          <p className="doc-card-desc">{description}</p>
        </div>
        <span className={STATUS_CLASS[state]}>{STATUS_LABEL[state]}</span>
      </div>

      <p className="doc-card-meta">
        Accepted formats: {acceptedFormatsText} · Max size: {maxSizeMb}MB
      </p>

      {!uploaded && (
        <div
          className={`doc-dropzone${dragOver ? " doc-dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            hidden
            disabled={disabled || uploading}
            onChange={(e) => {
              pickFile(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <div className="doc-progress-wrap">
              <div className="doc-progress-track">
                <div className="doc-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="hint">Uploading… {progress}%</span>
            </div>
          ) : (
            <>
              <span className="doc-dropzone-icon">⬆</span>
              <span className="doc-dropzone-text">
                <strong>Click to upload</strong> or drag and drop
              </span>
            </>
          )}
        </div>
      )}

      {uploaded && (
        <div className="doc-uploaded-row">
          <div className="doc-uploaded-info">
            <span className="doc-uploaded-icon">✓</span>
            <div>
              <div className="doc-uploaded-filename">{document.original_filename}</div>
              <div className="hint">{(document.file_size_bytes / 1024).toFixed(0)} KB</div>
            </div>
          </div>
          <div className="doc-uploaded-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              hidden
              disabled={disabled}
              onChange={(e) => {
                pickFile(e.target.files);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

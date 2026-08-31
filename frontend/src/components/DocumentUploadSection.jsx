import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import DocumentUploadCard from "./DocumentUploadCard";

export default function DocumentUploadSection({ quotationId, disabled, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState({});
  const [cardErrors, setCardErrors] = useState({});

  async function load() {
    try {
      const res = await api.get(`/api/quotes/${quotationId}/documents/status`);
      setStatus(res.data);
      onStatusChange?.(res.data);
    } catch (err) {
      setLoadError(errorMessage(err, "Could not load document upload status."));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  function validateLocally(file) {
    if (!status) return null;
    if (!status.allowed_mime_types.includes(file.type)) {
      const friendly = status.allowed_mime_types.map((t) => t.split("/").pop().toUpperCase()).join(", ");
      return `Unsupported file type. Accepted formats: ${friendly}.`;
    }
    const maxBytes = status.max_file_size_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      return `File is too large. Maximum allowed size is ${status.max_file_size_mb}MB.`;
    }
    return null;
  }

  async function handleUpload(documentType, file) {
    const validationError = validateLocally(file);
    if (validationError) {
      setCardErrors((prev) => ({ ...prev, [documentType]: validationError }));
      return;
    }
    setCardErrors((prev) => ({ ...prev, [documentType]: "" }));
    setProgress((prev) => ({ ...prev, [documentType]: 0 }));

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await api.post(`/api/quotes/${quotationId}/documents/${documentType}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
          setProgress((prev) => ({ ...prev, [documentType]: pct }));
        },
      });
      setStatus(res.data);
      onStatusChange?.(res.data);
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [documentType]: errorMessage(err, "Upload failed. Please try again."),
      }));
    } finally {
      setProgress((prev) => {
        const next = { ...prev };
        delete next[documentType];
        return next;
      });
    }
  }

  async function handleRemove(documentType) {
    setCardErrors((prev) => ({ ...prev, [documentType]: "" }));
    try {
      const res = await api.delete(`/api/quotes/${quotationId}/documents/${documentType}`);
      setStatus(res.data);
      onStatusChange?.(res.data);
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [documentType]: errorMessage(err, "Could not remove this document."),
      }));
    }
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!status) return <div className="hint">Loading document requirements…</div>;

  const acceptedFormatsText = status.allowed_mime_types.map((t) => t.split("/").pop().toUpperCase()).join(", ");

  return (
    <div>
      <div className="doc-section-head">
        <h3 style={{ fontSize: 13, margin: 0 }}>Required Documents</h3>
        <span className="hint">
          {status.uploaded_count} of {status.required_count} required documents uploaded
        </span>
      </div>
      <div className="doc-progress-track" style={{ marginTop: 8, marginBottom: 16 }}>
        <div
          className="doc-progress-fill"
          style={{ width: `${(status.uploaded_count / status.required_count) * 100}%` }}
        />
      </div>

      <div className="doc-card-grid">
        {status.slots.map((slot) => (
          <DocumentUploadCard
            key={slot.document_type}
            label={slot.label}
            description={slot.description}
            acceptedFormatsText={acceptedFormatsText}
            maxSizeMb={status.max_file_size_mb}
            document={slot.document}
            progress={progress[slot.document_type]}
            error={cardErrors[slot.document_type]}
            disabled={disabled}
            onUpload={(file) => handleUpload(slot.document_type, file)}
            onRemove={() => handleRemove(slot.document_type)}
          />
        ))}
      </div>
    </div>
  );
}

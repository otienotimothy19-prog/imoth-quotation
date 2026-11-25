import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

const ToastContext = createContext(null);

// Success / error notifications shown bottom-right for a few seconds.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind, message) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((all) => [...all.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss]
  );
  const api = useMemo(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            {t.kind === "error" ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
            <div style={{ flex: 1 }}>{t.message}</div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#64748b", padding: 0 }}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Outside a provider (e.g. in isolated tests) toasts are silently ignored.
const NOOP = { success: () => {}, error: () => {} };

export function useToast() {
  return useContext(ToastContext) || NOOP;
}

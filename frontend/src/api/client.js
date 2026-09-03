import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({ baseURL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("imoth_admin_token");
  const needsAuth =
    token &&
    (config.url?.startsWith("/api/admin") ||
      config.url === "/api/auth/me" ||
      config.url === "/api/auth/logout");
  if (needsAuth) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname.startsWith("/admin")) {
      localStorage.removeItem("imoth_admin_token");
      localStorage.removeItem("imoth_admin_user");
      if (window.location.pathname !== "/admin/login") {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (err?.code === "ECONNABORTED" || err?.message === "Network Error") {
    return "Could not reach the server. Check your connection and try again.";
  }
  const httpStatus = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  if (httpStatus === 401) return "Your session has expired. Please log in again.";
  if (httpStatus === 403) return "You don't have permission to do that.";
  if (httpStatus === 404) return "Not found — it may have been removed.";
  if (httpStatus === 409) return "This was changed by someone else. Refresh and try again.";
  if (httpStatus === 422) return "Please check the highlighted fields and try again.";
  if (httpStatus >= 500) return "The server had a problem handling that. Please try again shortly.";
  return fallback;
}

// FastAPI/pydantic 422 errors carry a `detail` array of
// {loc: ["body", "field"], msg: "..."} objects. This turns that into a
// {fieldName: "message"} map so forms can show the error next to the
// input that caused it, instead of only a single top-of-form banner.
export function fieldErrors(err) {
  const detail = err?.response?.data?.detail;
  if (!Array.isArray(detail)) return {};
  const out = {};
  for (const d of detail) {
    const loc = Array.isArray(d.loc) ? d.loc : [];
    const field = loc[loc.length - 1];
    if (typeof field === "string") out[field] = d.msg;
  }
  return out;
}

// Downloads an authenticated blob response (from an axios call made with
// responseType: "blob") as a file, without ever putting the admin bearer
// token in a plain <a href> (protected endpoints 401 on a bare navigation).
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const money = (n) =>
  "Kshs " + Math.round(Number(n) || 0).toLocaleString("en-KE");

export const dateFmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const dateTimeFmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

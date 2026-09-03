import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("imoth_admin_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [ready, setReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("imoth_admin_token");
    if (!token) {
      setReady(true);
      return;
    }
    api
      .get("/api/auth/me")
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("imoth_admin_user", JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem("imoth_admin_token");
        localStorage.removeItem("imoth_admin_user");
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  async function login(email, password) {
    const res = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("imoth_admin_token", res.data.access_token);
    localStorage.setItem("imoth_admin_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      /* Logout is best-effort server-side (audit log only); the session is
      cleared client-side regardless so the admin is never stuck logged in
      because of a network blip. */
    } finally {
      localStorage.removeItem("imoth_admin_token");
      localStorage.removeItem("imoth_admin_user");
      setUser(null);
      setLoggingOut(false);
    }
  }

  const value = useMemo(() => ({ user, ready, login, logout, loggingOut }), [user, ready, loggingOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

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
    // Agents stay logged in on their device: every launch swaps the stored
    // token for a fresh long-lived one, so they only see the login screen
    // again if they log out or an admin disables their account.
    const isAgent = user?.role === "AGENT";
    const request = isAgent ? api.post("/api/auth/refresh", {}) : api.get("/api/auth/me");
    request
      .then((res) => {
        const freshUser = isAgent ? res.data.user : res.data;
        if (isAgent) localStorage.setItem("imoth_admin_token", res.data.access_token);
        setUser(freshUser);
        localStorage.setItem("imoth_admin_user", JSON.stringify(freshUser));
      })
      .catch((err) => {
        // Only a definite "not allowed" ends the session. Being offline or a
        // server hiccup must not log an agent out of the installed app.
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem("imoth_admin_token");
          localStorage.removeItem("imoth_admin_user");
          setUser(null);
        }
      })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startSession(data) {
    localStorage.setItem("imoth_admin_token", data.access_token);
    localStorage.setItem("imoth_admin_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  // Step 1 of login. Returns { otpRequired: true, challengeId, emailHint }
  // when a code was emailed, or { user } when login codes are switched off.
  async function login(email, password) {
    const res = await api.post("/api/auth/login", { email, password });
    if (res.data.otp_required) {
      return {
        otpRequired: true,
        challengeId: res.data.challenge_id,
        emailHint: res.data.email_hint,
        expiresInSeconds: res.data.expires_in_seconds,
      };
    }
    return { user: startSession(res.data) };
  }

  // Step 2: the emailed code. Starts the session and returns the user.
  async function verifyOtp(challengeId, code) {
    const res = await api.post("/api/auth/verify-otp", { challenge_id: challengeId, code });
    return startSession(res.data);
  }

  async function resendOtp(challengeId) {
    await api.post("/api/auth/resend-otp", { challenge_id: challengeId });
  }

  async function changePassword(currentPassword, newPassword) {
    const res = await api.post("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return startSession(res.data);
  }

  function clearSession() {
    localStorage.removeItem("imoth_admin_token");
    localStorage.removeItem("imoth_admin_user");
    setUser(null);
  }

  // Ends every session for this account on every device, including this one.
  async function logoutAll() {
    await api.post("/api/auth/logout-all", {});
    clearSession();
  }

  async function signupAgent(details) {
    const res = await api.post("/api/auth/agent-signup", details);
    return res.data.message;
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
      clearSession();
      setLoggingOut(false);
    }
  }

  const value = useMemo(
    () => ({ user, ready, login, verifyOtp, resendOtp, changePassword, logout, logoutAll, signupAgent, loggingOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, ready, loggingOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import { useState, useEffect, useCallback } from "react";

export function useAuth() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json().catch(() => ({}));
      setIsAuthed(Boolean(data?.authenticated));
    } catch {
      setIsAuthed(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setIsAuthed(false);
    }
  }, []);

  const onLoginSuccess = useCallback(() => {
    setIsAuthed(true);
  }, []);

  return {
    isAuthed,
    setIsAuthed,
    checkingAuth,
    logout,
    onLoginSuccess,
    checkSession,
  };
}

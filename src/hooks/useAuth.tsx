import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch, ApiError, setAuthToken, getAuthToken } from "@/lib/api";

interface AuthContextType {
  user: { id: string; email: string; displayName: string | null } | null;
  loading: boolean;
  setUser: (u: { id: string; email: string; displayName: string | null } | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  devLogin: (email?: string, password?: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<{ id: string; email: string; displayName: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    apiFetch<{ id: string; email: string; displayName: string | null }>("/api/auth/me")
      .then((me) => {
        setUser(me);
        setLoading(false);
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
        setLoading(false);
      });
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const result = await apiFetch<{ token: string; user: { id: string; email: string; displayName: string | null } }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setAuthToken(result.token);
      setUser(result.user);
      return { error: null };
    } catch (err) {
      let message = "Login gagal.";
      if (err instanceof ApiError) {
        if (err.status === 401) message = "Email atau password salah.";
        else if (err.status === 429) message = "Terlalu banyak percobaan login. Coba lagi sebentar.";
        else if (err.status >= 500) message = "Server login sedang bermasalah. Periksa deployment atau coba lagi sesaat.";
        else message = err.message;
      } else if (err instanceof TypeError) {
        message = "Server tidak dapat dijangkau. Periksa URL API atau status server.";
      }
      return { error: new Error(message) };
    }
  };

  const devLogin = async (email = "admin@example.com", password = "password123") => {
    try {
      const result = await apiFetch<{ token: string; user: { id: string; email: string; displayName: string | null } }>(
        "/api/auth/dev-login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setAuthToken(result.token);
      setUser(result.user);
      return { error: null };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Dev login gagal";
      return { error: new Error(message) };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const result = await apiFetch<{ token: string; user: { id: string; email: string; displayName: string | null } }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setAuthToken(result.token);
      setUser(result.user);
      return { error: null };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Registrasi gagal";
      return { error: new Error(message) };
    }
  };

  const signOut = async () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, signIn, devLogin, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

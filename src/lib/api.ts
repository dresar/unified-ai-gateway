const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const getAuthToken = () => localStorage.getItem("auth_token");
export const setAuthToken = (token: string | null) => {
  if (token) localStorage.setItem("auth_token", token);
  else localStorage.removeItem("auth_token");
};

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401 && path.startsWith("/api/")) {
      setAuthToken(null);
      window.location.href = "/login";
      throw new ApiError(401, "Sesi tidak valid. Silakan login lagi.");
    }
    const message =
      isJson && payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : typeof payload === "string"
          ? payload
          : "Permintaan gagal.";
    throw new ApiError(res.status, message);
  }

  return payload as T;
};


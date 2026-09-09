const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v3";

export function getToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem("access_token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`);
  }
  return payload as T;
}


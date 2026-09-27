function apiUrl(): string {
  return "/backend/api/v3";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && typeof window !== "undefined") {
      window.location.replace("/login");
    }
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`);
  }
  return payload as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiUrl()}${path}`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.replace("/login");
    }
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`);
  }
  return response.blob();
}

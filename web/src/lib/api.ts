import { getAuthToken } from "@/lib/auth/cookies";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

export type CurrentUser = {
  id: string;
  username: string;
  role: "elder" | "caregiver";
  display_name: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await apiFetch("/me");
  if (!res.ok) return null;
  return (await res.json()) as CurrentUser;
}

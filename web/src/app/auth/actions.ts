"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { clearAuthCookie, setAuthCookie } from "@/lib/auth/cookies";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type AuthResponse = {
  access_token: string;
  user: {
    id: string;
    username: string;
    role: "elder" | "caregiver";
    display_name: string | null;
  };
};

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data === "object" && data && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      if (typeof d === "string") return d;
      return JSON.stringify(d);
    }
    return JSON.stringify(data);
  } catch {
    return res.statusText;
  }
}

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await readError(res);
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  const data = (await res.json()) as AuthResponse;
  await setAuthCookie(data.access_token);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const displayNameRaw = String(formData.get("display_name") ?? "").trim();
  const display_name = displayNameRaw.length > 0 ? displayNameRaw : null;

  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role, display_name }),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await readError(res);
    redirect(`/signup?error=${encodeURIComponent(msg)}`);
  }
  const data = (await res.json()) as AuthResponse;
  await setAuthCookie(data.access_token);
  revalidatePath("/", "layout");
  redirect(data.user.role === "elder" ? "/elder" : "/caregiver");
}

export async function logout() {
  await clearAuthCookie();
  revalidatePath("/", "layout");
  redirect("/");
}

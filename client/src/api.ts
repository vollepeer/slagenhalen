import { supabase } from "./supabaseClient";
import { queueForRetry } from "./retryQueue";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function rawRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload && payload.message) || "Onbekende fout.");
  }
  return payload as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return rawRequest<T>(path, "GET");
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  try {
    return await rawRequest<T>(path, method, body);
  } catch (error) {
    if (error instanceof TypeError) {
      queueForRetry({ path, method, body });
    }
    throw error;
  }
}

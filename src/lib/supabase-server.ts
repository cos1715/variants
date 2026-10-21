import "server-only";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function config() {
  if (!url || !serviceKey) throw new Error("Supabase is not configured. Add variables to .env.local.");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

export async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const settings = config();
  const response = await fetch(`${settings.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: settings.serviceKey,
      Authorization: `Bearer ${settings.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Database request failed: ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

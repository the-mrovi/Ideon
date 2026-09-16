import "server-only";

export class SupabaseConfigurationError extends Error {
  constructor() { super("Supabase server environment is not configured."); this.name = "SupabaseConfigurationError"; }
}

function environment() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) throw new SupabaseConfigurationError();
  return { url, publishableKey, serviceRoleKey };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
  serviceRole?: boolean;
  prefer?: string;
}

export async function supabaseRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const env = environment();
  const key = options.serviceRole === false ? env.publishableKey : env.serviceRoleKey;
  const response = await fetch(`${env.url}${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${options.accessToken ?? key}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function rpc<T>(name: string, body: Record<string, unknown>, options: Omit<RequestOptions, "method" | "body"> = {}) {
  return supabaseRequest<T>(`/rest/v1/rpc/${name}`, { ...options, method: "POST", body });
}

export function getSupabasePublicConfig() {
  const env = environment();
  return { url: env.url, publishableKey: env.publishableKey };
}

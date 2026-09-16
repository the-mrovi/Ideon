import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabasePublicConfig, supabaseRequest } from "./supabase.ts";

const COOKIE = "ideon_admin_access";

export async function signInAdmin(email: string, password: string) {
  const { url, publishableKey } = getSupabasePublicConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), cache: "no-store" });
  if (!response.ok) throw new Error("invalid_credentials");
  const result = await response.json() as { access_token: string; expires_in?: number };
  const profiles = await supabaseRequest<Array<{ role: string }>>("/rest/v1/admin_profiles?select=role", { serviceRole: false, accessToken: result.access_token });
  if (!profiles.some((profile) => ["researcher", "admin"].includes(profile.role))) throw new Error("not_authorized");
  const jar = await cookies();
  jar.set(COOKIE, result.access_token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.min(result.expires_in ?? 3600, 3600) });
}
export async function signOutAdmin() { (await cookies()).delete(COOKIE); }

export async function getAdminAccessToken() { return (await cookies()).get(COOKIE)?.value ?? null; }

export async function requireAdmin() {
  const token = await getAdminAccessToken();
  if (!token) redirect("/admin");
  try {
    const profiles = await supabaseRequest<Array<{ role: string; display_name: string | null }>>("/rest/v1/admin_profiles?select=role,display_name", { serviceRole: false, accessToken: token });
    if (!profiles.length) redirect("/admin");
    return { token, profile: profiles[0] };
  } catch { redirect("/admin"); }
}

import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-push-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuration serveur manquante : ${name}`);
  return value;
}

function injectedKey(mapName: string, legacyName: string) {
  const raw = Deno.env.get(mapName);
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys?.default === "string" && keys.default) return keys.default;
    } catch {}
  }
  return requiredEnv(legacyName);
}

export function adminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), injectedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(requiredEnv("SUPABASE_URL"), injectedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function isAdminEmail(email: string | null | undefined) {
  const configured = Deno.env.get("SLM_ADMIN_EMAILS") || "";
  const allowed = configured.split(/[;,\s]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.trim().toLowerCase());
}

export async function isAdminUser(user: { id: string; email?: string | null }, admin: ReturnType<typeof adminClient>) {
  if (isAdminEmail(user.email)) return true;
  const { data, error } = await admin.from("billing_accounts").select("role,role_source").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.role === "admin" && data?.role_source === "manual";
}

export async function stripeRequest(path: string, method = "GET", params?: URLSearchParams, idempotencyKey?: string) {
  const headers = new Headers({ Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}` });
  if (params) headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    body: params,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Stripe a répondu ${response.status}`);
  return result;
}

export function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

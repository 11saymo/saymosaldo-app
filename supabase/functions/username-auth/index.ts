import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGIN = "https://11saymo.github.io";
const USERNAME_DOMAIN = "accounts.saymosaldo.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(username) ? username : null;
}

function usernameEmail(username: string) {
  return `${username}@${USERNAME_DOMAIN}`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (origin !== ALLOWED_ORIGIN) return response({ error: "origin_not_allowed" }, 403);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  let payload: { action?: string; username?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const username = normalizeUsername(payload.username);
  const password = payload.password;
  if (!username) return response({ error: "username_invalid" }, 400);

  if (payload.action === "register") {
    if (typeof password !== "string" || password.length < 12 || password.length > 72) {
      return response({ error: "password_invalid" }, 400);
    }

    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || forwardedFor?.at(-1);
    if (!ip) return response({ error: "temporarily_unavailable" }, 503);
    const ipHash = await sha256(ip);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: insertError } = await admin
      .from("username_auth_rate_limits")
      .insert({ ip_hash: ipHash });
    if (insertError) return response({ error: "temporarily_unavailable" }, 503);

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("username_auth_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (countError) return response({ error: "temporarily_unavailable" }, 503);
    if ((count ?? 0) > 5) return response({ error: "rate_limited" }, 429);

    const { data, error } = await admin.auth.admin.createUser({
      email: usernameEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error || !data.user) {
      const message = error?.message || "";
      if (/already|registered|exists/i.test(message)) return response({ error: "username_taken" }, 409);
      return response({ error: "registration_failed" }, 400);
    }
    return response({ ok: true });
  }

  if (payload.action === "claim") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "authentication_required" }, 401);

    const verifier = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.getUser(token);
    if (verifyError || !verified.user) return response({ error: "authentication_required" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.updateUserById(verified.user.id, {
      email: usernameEmail(username),
      email_confirm: true,
      user_metadata: { ...verified.user.user_metadata, username },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return response({ error: "username_taken" }, 409);
      return response({ error: "username_update_failed" }, 400);
    }
    return response({ ok: true });
  }

  return response({ error: "unknown_action" }, 400);
});
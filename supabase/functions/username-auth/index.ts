import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGINS = new Set([
  "https://11saymo.github.io",
  "https://saymosaldo-preview.onrender.com",
]);
const USERNAME_DOMAIN = "accounts.saymosaldo.app";

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function response(body: Record<string, unknown>, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
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
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return response({ error: "origin_not_allowed" }, origin, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return response({ error: "origin_not_allowed" }, origin, 403);
  }
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, origin, 405);

  let payload: { action?: string; username?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return response({ error: "invalid_request" }, origin, 400);
  }

  const username = normalizeUsername(payload.username);
  const password = payload.password;
  if (!username) return response({ error: "username_invalid" }, origin, 400);

  if (payload.action === "register") {
    if (typeof password !== "string" || password.length < 12 || password.length > 72) {
      return response({ error: "password_invalid" }, origin, 400);
    }

    // Trust only the Cloudflare-provided client IP. Forwarding headers such as
    // X-Forwarded-For and X-Real-IP may be supplied or influenced by the caller.
    const ip = req.headers.get("cf-connecting-ip")?.trim();
    if (!ip) return response({ error: "temporarily_unavailable" }, origin, 503);
    const ipHash = await sha256(ip);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: allowed, error: rateLimitError } = await admin.rpc(
      "consume_username_registration_attempt",
      { p_ip_hash: ipHash },
    );
    if (rateLimitError || typeof allowed !== "boolean") {
      return response({ error: "temporarily_unavailable" }, origin, 503);
    }
    if (!allowed) return response({ error: "rate_limited" }, origin, 429);

    const { data, error } = await admin.auth.admin.createUser({
      email: usernameEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error || !data.user) {
      const message = error?.message || "";
      if (/already|registered|exists/i.test(message)) return response({ error: "username_taken" }, origin, 409);
      return response({ error: "registration_failed" }, origin, 400);
    }
    return response({ ok: true }, origin);
  }

  if (payload.action === "claim") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
    if (!token) return response({ error: "authentication_required" }, origin, 401);

    const verifier = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.getUser(token);
    if (verifyError || !verified.user) return response({ error: "authentication_required" }, origin, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.updateUserById(verified.user.id, {
      email: usernameEmail(username),
      email_confirm: true,
      user_metadata: { ...verified.user.user_metadata, username },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return response({ error: "username_taken" }, origin, 409);
      return response({ error: "username_update_failed" }, origin, 400);
    }
    return response({ ok: true }, origin);
  }

  return response({ error: "unknown_action" }, origin, 400);
});

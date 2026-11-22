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
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(body: Record<string, unknown>, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
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

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function createRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkAttempt(req: Request): Promise<"allowed" | "limited" | "unavailable"> {
  const ip = req.headers.get("cf-connecting-ip")?.trim();
  if (!ip) return "unavailable";
  const ipHash = await sha256(ip);
  const { data, error } = await admin.rpc("consume_username_registration_attempt", { p_ip_hash: ipHash });
  if (error || typeof data !== "boolean") return "unavailable";
  return data ? "allowed" : "limited";
}

function rateLimitResponse(result: "allowed" | "limited" | "unavailable", origin: string | null) {
  if (result === "limited") return response({ error: "rate_limited" }, origin, 429);
  if (result === "unavailable") return response({ error: "temporarily_unavailable" }, origin, 503);
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response({ error: "origin_not_allowed" }, origin, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response({ error: "origin_not_allowed" }, origin, 403);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, origin, 405);

  let payload: { action?: string; username?: string; password?: string; recovery_code?: string };
  try {
    payload = await req.json();
  } catch {
    return response({ error: "invalid_request" }, origin, 400);
  }

  const username = normalizeUsername(payload.username);
  if (!username) return response({ error: "username_invalid" }, origin, 400);
  const password = payload.password;

  if (payload.action === "register") {
    if (typeof password !== "string" || password.length < 12 || password.length > 72) {
      return response({ error: "password_invalid" }, origin, 400);
    }
    const limited = rateLimitResponse(await checkAttempt(req), origin);
    if (limited) return limited;

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

    const recoveryCode = createRecoveryCode();
    const { error: recoveryError } = await admin.from("username_recovery_codes").insert({
      user_id: data.user.id,
      code_hash: await sha256(recoveryCode),
    });
    if (recoveryError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return response({ error: "registration_failed" }, origin, 503);
    }
    return response({ ok: true, recovery_code: recoveryCode }, origin);
  }

  if (payload.action === "reset_password") {
    if (typeof password !== "string" || password.length < 12 || password.length > 72) {
      return response({ error: "password_invalid" }, origin, 400);
    }
    const limited = rateLimitResponse(await checkAttempt(req), origin);
    if (limited) return limited;
    const recoveryCode = payload.recovery_code;
    if (typeof recoveryCode !== "string" || !/^[0-9a-f]{48}$/.test(recoveryCode)) {
      return response({ error: "recovery_invalid" }, origin, 400);
    }

    const { data: userId, error: findError } = await admin.rpc("find_auth_user_id_by_email", {
      p_email: usernameEmail(username),
    });
    if (findError || typeof userId !== "string") return response({ error: "recovery_invalid" }, origin, 400);
    const { data: stored, error: storedError } = await admin
      .from("username_recovery_codes")
      .select("code_hash")
      .eq("user_id", userId)
      .maybeSingle();
    if (storedError || !stored?.code_hash) return response({ error: "recovery_invalid" }, origin, 400);

    const suppliedHash = await sha256(recoveryCode);
    if (!constantTimeEqual(suppliedHash, stored.code_hash)) {
      return response({ error: "recovery_invalid" }, origin, 400);
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) return response({ error: "password_reset_failed" }, origin, 503);

    // Keep the high-entropy recovery code stable so a lost HTTP response
    // cannot strand the user after a successful password change.
    return response({ ok: true, recovery_code: recoveryCode }, origin);
  }

  if (payload.action === "claim") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "authentication_required" }, origin, 401);
    const verifier = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.getUser(token);
    if (verifyError || !verified.user) return response({ error: "authentication_required" }, origin, 401);
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

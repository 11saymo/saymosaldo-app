import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://munora.ru";

function headers(origin: string | null) {
  const value: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin === ALLOWED_ORIGIN) value["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  return value;
}

Deno.serve((req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: headers(origin),
    });
  }

  if (origin !== ALLOWED_ORIGIN) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { ...headers(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    error: "legacy_auth_retired",
    message: "Username and recovery-code authentication has been retired. Use Google sign-in.",
  }), {
    status: 410,
    headers: { ...headers(origin), "Content-Type": "application/json" },
  });
});

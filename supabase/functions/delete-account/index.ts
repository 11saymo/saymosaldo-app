const SITE_ORIGIN = 'https://munora.ru';

function response(body: Record<string, unknown>, status = 200, origin = SITE_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Vary': 'Origin'
    }
  });
}

function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

function getPublishableKey(): string {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    return String(keys.default || '');
  } catch {
    return '';
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') {
    if (origin !== SITE_ORIGIN) return new Response('Forbidden', { status: 403 });
    return response({ ok: true });
  }
  if (origin !== SITE_ORIGIN) return response({ error: 'origin_not_allowed' }, 403);
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return response({ error: 'unauthorized' }, 401);

  const claims = decodeClaims(token);
  const authTime = Number(claims?.auth_time);
  const now = Math.floor(Date.now() / 1000);
  if (!claims || !claims.sub || !Number.isFinite(authTime) || authTime > now + 60 || now - authTime > 600) {
    return response({ error: 'reauthentication_required' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response({ error: 'invalid_request' }, 400);
  }
  if (body.confirmation !== 'DELETE') return response({ error: 'confirmation_required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const publishableKey = getPublishableKey();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return response({ error: 'server_configuration_error' }, 500);
  }

  // Verify the bearer token against Supabase Auth before using its subject.
  const userResponse = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + token },
    cache: 'no-store'
  });
  if (!userResponse.ok) return response({ error: 'unauthorized' }, 401);
  const user = await userResponse.json();
  if (!user || user.id !== claims.sub) return response({ error: 'unauthorized' }, 401);

  // The service-role key stays inside this Edge Function and is never sent to the browser.
  // Foreign keys cascade removal of cloud data, backups, and legacy recovery-code rows.
  const deleteResponse = await fetch(
    supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(user.id),
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    }
  );
  if (!deleteResponse.ok) {
    return response({ error: 'account_deletion_failed' }, 500);
  }

  return response({ ok: true });
});

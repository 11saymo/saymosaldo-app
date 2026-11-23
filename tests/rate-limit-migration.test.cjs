const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, '20261122000002_username_auth_rate_limit.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/username-auth/index.ts'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

test('retired rate-limit storage remains inaccessible to public and authenticated clients', () => {
  assert.match(sql, /create table if not exists public\.username_auth_rate_limits/i);
  assert.match(sql, /alter table public\.username_auth_rate_limits enable row level security/i);
  assert.match(sql, /revoke all on table public\.username_auth_rate_limits from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.username_auth_rate_limits to service_role/i);
  assert.match(sql, /revoke all on function public\.consume_username_registration_attempt\(text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.consume_username_registration_attempt\(text\) to service_role/i);
});

test('legacy endpoint is retired, origin-limited, and requires a valid JWT', () => {
  assert.match(edge, /ALLOWED_ORIGIN = "https:\/\/munora\.ru"/);
  assert.match(edge, /legacy_auth_retired/);
  assert.match(edge, /status: 410/);
  assert.doesNotMatch(edge, /cf-connecting-ip|consume_username_registration_attempt|createUser/);
  assert.match(config, /verify_jwt = true/);
});

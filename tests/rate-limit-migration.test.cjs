const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', '20261122000002_username_auth_rate_limit.sql'), 'utf8');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'username-auth', 'index.ts'), 'utf8');

test('rate-limit migration matches the deployed username-auth contract', () => {
  assert.match(sql, /create table if not exists public\.username_auth_rate_limits/i);
  assert.doesNotMatch(sql, /username_auth_attempts/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /interval '10 minutes'/i);
  assert.match(sql, /return v_count <= 5/i);
  assert.match(sql, /alter table public\.username_auth_rate_limits enable row level security/i);
  assert.match(sql, /revoke all on table public\.username_auth_rate_limits from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.username_auth_rate_limits to service_role/i);
  assert.match(sql, /revoke all on function public\.consume_username_registration_attempt\(text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.consume_username_registration_attempt\(text\) to service_role/i);
  assert.match(edge, /cf-connecting-ip/);
  assert.match(edge, /rpc\("consume_username_registration_attempt"/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/username-auth/index.ts'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

function loadAuthApi() {
  const document = { readyState: 'loading', addEventListener() {}, querySelectorAll() {} };
  const window = {};
  vm.runInNewContext(source, { window, document, console, URL, AbortController, setTimeout, clearTimeout });
  return window.SaymoSaldoAuth;
}

const auth = loadAuthApi();

test('Google sign-in uses PKCE and only the public identity scopes', () => {
  const target = new URL(auth.googleAuthorizeUrl('challenge-value', 'https://munora.ru/'));
  assert.equal(target.origin, 'https://pmrrslmkrulhuapxtltm.supabase.co');
  assert.equal(target.pathname, '/auth/v1/authorize');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), 'https://munora.ru/');
  assert.equal(target.searchParams.get('code_challenge'), 'challenge-value');
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.equal(target.searchParams.get('scopes'), 'openid email profile');
});

test('public sign-in screen exposes Google and keeps legacy password forms unavailable', () => {
  assert.match(html, /id="googleSignInButton"/);
  assert.match(html, /id="authRegisterForm"[^>]*hidden/);
  assert.match(html, /id="authResetForm"[^>]*hidden/);
  assert.match(html, /id="authLoginForm"/);
});

test('OAuth verifier is generated with Web Crypto and stored only for the current tab', () => {
  assert.match(source, /crypto\.getRandomValues/);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source, /sessionStorage\.setItem\(GOOGLE_PKCE_KEY, verifier\)/);
  assert.match(source, /sessionStorage\.removeItem\(GOOGLE_PKCE_KEY\)/);
  assert.match(source, /credentials: 'omit'/);
});

test('persistent app session does not store Google provider access or refresh tokens', () => {
  const start = source.indexOf('function storeSession(value) {');
  const end = source.indexOf('function clearSession()', start);
  assert.ok(start >= 0 && end > start);
  const implementation = source.slice(start, end);
  assert.doesNotMatch(implementation, /provider_(?:refresh_)?token/);
  assert.match(implementation, /access_token: value\.access_token/);
  assert.match(implementation, /refresh_token: value\.refresh_token/);
});

test('cloud data normalization preserves supported user data and safely defaults missing fields', () => {
  const normalized = auth.normalizeCloudData({
    tx: [{ id: '1' }], goals: [], chatFinance: [{ role: 'user' }], debts: 'invalid'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    tx: [{ id: '1' }], goals: [], budgets: [], recurring: [], debts: [],
    chat_finance: [{ role: 'user' }]
  });
  assert.equal(auth.hasData({ chatFinance: [{ text: 'hello' }] }), true);
  assert.equal(auth.hasData(null), false);
});

test('legacy username and recovery-code endpoint is retired and JWT protected', () => {
  assert.match(edge, /ALLOWED_ORIGIN = "https:\/\/munora\.ru"/);
  assert.match(edge, /legacy_auth_retired/);
  assert.match(edge, /status: 410/);
  assert.doesNotMatch(edge, /createUser|updateUserById|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(config, /\[functions\.username-auth\]\s+verify_jwt = true/);
});

test('public client contains no privileged Supabase keys', () => {
  for (const file of ['index.html', 'auth.js', 'app.js', 'learning.js', 'sw.js']) {
    const value = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(value, /\bservice_role\b|\bsb_secret_[A-Za-z0-9_]+/i, file);
  }
});

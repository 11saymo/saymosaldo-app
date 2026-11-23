const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/username-auth/index.ts'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const deletion = fs.readFileSync(path.join(root, 'supabase/functions/delete-account/index.ts'), 'utf8');

function loadAuthApi() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
  const window = { addEventListener() {} };
  vm.runInNewContext(source, { window, document, console, URL, AbortController, setTimeout, clearTimeout, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
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

test('public sign-in screen exposes Google only and contains no dormant password forms', () => {
  assert.match(html, /id="googleSignInButton"/);
  assert.match(html, /id="authLoginForm"/);
  assert.doesNotMatch(html, /authRegisterForm|authResetForm|recoveryPanel/);
  assert.doesNotMatch(source, /username-auth|grant_type=password|reset_password|recoveryCode/);
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

test('self-service account deletion is authenticated, recent-session protected, and server-side', () => {
  assert.ok(source.includes('/functions/v1/delete-account'));
  assert.match(source, /deleteAccount/);
  assert.match(app, /data-act="account-delete"/);
  assert.match(deletion, /auth_time/);
  assert.ok(deletion.includes('claims?.amr'));
  assert.match(deletion, /method === 'oauth'/);
  assert.match(deletion, /now - authTime > 600/);
  assert.ok(deletion.includes("body.confirmation !== 'DELETE'"));
  assert.ok(deletion.includes('/auth/v1/user'));
  assert.ok(deletion.includes('/auth/v1/admin/users/'));
  assert.ok(config.includes('[functions.delete-account]'));
  assert.match(config, /verify_jwt = true/);
  assert.match(deletion, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source + html, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});

test('public client contains no privileged Supabase keys', () => {
  for (const file of ['index.html', 'auth.js', 'app.js', 'learning.js', 'sw.js']) {
    const value = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(value, /\bservice_role\b|\bsb_secret_[A-Za-z0-9_]+/i, file);
  }
});

test('service worker never persists OAuth callback URLs in Cache Storage', () => {
  assert.match(serviceWorker, /isAuthCallback/);
  assert.match(serviceWorker, /if\(res\.ok&&!isAuthCallback\)/);
  assert.match(serviceWorker, /'access_token','refresh_token','token_hash'/);
});

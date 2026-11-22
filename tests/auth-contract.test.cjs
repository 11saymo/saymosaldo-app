const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadAuthApi() {
  const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'auth.js'), 'utf8');
  const document = {
    readyState: 'loading',
    addEventListener() {},
  };
  const window = {};
  vm.runInNewContext(source, { window, document, console, URL, AbortController, setTimeout, clearTimeout });
  return window.SaymoSaldoAuth;
}

const auth = loadAuthApi();

test('username validation accepts supported usernames and rejects unsafe formats', () => {
  assert.equal(auth.normalizeUsername('  User.Name_7  '), 'user.name_7');
  assert.equal(auth.normalizeUsername('ab'), null);
  assert.equal(auth.normalizeUsername('bad name'), null);
  assert.equal(auth.normalizeUsername('x'.repeat(25)), null);
});

test('login supports usernames and legacy email accounts', () => {
  assert.equal(auth.loginEmail('Valid.User'), 'valid.user@accounts.saymosaldo.app');
  assert.equal(auth.loginEmail('old@example.com'), 'old@example.com');
  assert.equal(auth.loginEmail('not-an-email@'), null);
});

test('password policy enforces the configured 12–72 character range', () => {
  assert.equal(auth.validPassword('123456789012'), true);
  assert.equal(auth.validPassword('short'), false);
  assert.equal(auth.validPassword('x'.repeat(73)), false);
});

test('cloud data normalization preserves supported arrays and safely defaults missing fields', () => {
  const normalized = auth.normalizeCloudData({
    tx: [{ id: '1' }],
    goals: [],
    chatFinance: [{ role: 'user' }],
    debts: 'invalid',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    tx: [{ id: '1' }],
    goals: [],
    budgets: [],
    recurring: [],
    debts: [],
    chat_finance: [{ role: 'user' }],
  });
});

test('empty-data detection handles legacy chat key and malformed input', () => {
  assert.equal(auth.hasData({ chatFinance: [{ text: 'hello' }] }), true);
  assert.equal(auth.hasData({ tx: 'invalid' }), false);
  assert.equal(auth.hasData(null), false);
});

test('Google sign-in uses a pinned provider, PKCE challenge, and the supplied app redirect', () => {
  const target = new URL(auth.googleAuthorizeUrl('challenge-value', 'https://11saymo.github.io/saymosaldo-app/'));
  assert.equal(target.origin, 'https://pmrrslmkrulhuapxtltm.supabase.co');
  assert.equal(target.pathname, '/auth/v1/authorize');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), 'https://11saymo.github.io/saymosaldo-app/');
  assert.equal(target.searchParams.get('code_challenge'), 'challenge-value');
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.equal(target.searchParams.has('scopes'), false);
});

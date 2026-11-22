const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
const edgeSource = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "username-auth", "index.ts"), "utf8");
const migrationSource = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261122000000_username_recovery_codes.sql"), "utf8");
const supabaseConfig = fs.readFileSync(path.join(__dirname, "..", "supabase", "config.toml"), "utf8");
const lookupMigration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261122000001_auth_user_lookup.sql"), "utf8");
for (const required of [
  "email_confirm: true",
  "consume_username_registration_attempt",
  "rate_limited",
  "username_recovery_codes",
  "crypto.getRandomValues",
  "crypto.subtle.digest",
  "constantTimeEqual",
  "updateUserById",
  "find_auth_user_id_by_email"
]) assert.ok(edgeSource.includes(required), "Edge function missing security requirement: " + required);
assert.ok(migrationSource.includes("enable row level security"));
assert.ok(migrationSource.includes("revoke all on table public.username_recovery_codes from public, anon, authenticated"));
assert.ok(supabaseConfig.includes("verify_jwt = false"));
assert.ok(!edgeSource.includes("getUserByEmail"), "Use the supported server-side user lookup RPC");
assert.ok(lookupMigration.includes("security definer"));
assert.ok(lookupMigration.includes("set search_path = pg_catalog, auth"));
assert.ok(lookupMigration.includes("grant execute on function public.find_auth_user_id_by_email(text) to service_role"));
assert.ok(lookupMigration.includes("revoke all on function public.find_auth_user_id_by_email(text) from public, anon, authenticated"));
assert.ok(!edgeSource.includes("sb_secret_"), "No secret key may be hard-coded in the edge function");

const handlers = {};
const calls = [];
const fakeDocument = {
  readyState: "loading",
  addEventListener(name, callback) { handlers[name] = callback; },
  getElementById() { return null; },
  querySelectorAll() { return []; }
};
const fakeWindow = { addEventListener() {} };
const context = {
  window: fakeWindow,
  document: fakeDocument,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => "{}" };
  },
  AbortController,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  String,
  Number,
  Math,
  Error,
  Promise,
  encodeURIComponent,
  navigator: {},
  console
};
vm.createContext(context);
vm.runInContext(source, context, { timeout: 1000 });
const auth = fakeWindow.SaymoSaldoAuth;

assert.ok(auth, "auth module must expose its public helpers");
assert.equal(auth.normalizeUsername("  Saymo_User-1 "), "saymo_user-1");
assert.equal(auth.normalizeUsername("ab"), null);
assert.equal(auth.normalizeUsername("логин"), null);
assert.equal(auth.normalizeUsername("user name"), null);
assert.equal(auth.usernameEmail("Saymo"), "saymo@accounts.saymosaldo.app");
assert.equal(auth.usernameEmail("bad user"), null);
assert.equal(auth.loginEmail("  Saymo_User "), "saymo_user@accounts.saymosaldo.app");
assert.equal(auth.loginEmail("Old.Account@Example.com"), "old.account@example.com");
assert.equal(auth.loginEmail("not-an-email@"), null);
assert.equal(auth.loginEmail("логин"), null);
assert.equal(auth.validPassword("123456789012"), true);
assert.equal(auth.validPassword("short"), false);
assert.equal(auth.validPassword("x".repeat(73)), false);

const cloud = auth.normalizeCloudData({
  tx: [{ id: "t1" }],
  goals: [],
  chat_finance: [{ role: "assistant", text: "ok" }]
});
assert.equal(cloud.tx.length, 1);
assert.equal(cloud.chat_finance.length, 1);
assert.equal(auth.hasData(cloud), true);
assert.equal(auth.hasData({}), false);

(async () => {
  const result = await auth.apiRequest("/functions/v1/username-auth", {
    method: "POST",
    body: { action: "register", username: "saymo", password: "123456789012" }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://pmrrslmkrulhuapxtltm.supabase.co/functions/v1/username-auth");
  assert.equal(calls[0].options.method, "POST");
  assert.ok(calls[0].options.headers.apikey.startsWith("sb_publishable_"));
  assert.equal(JSON.parse(calls[0].options.body).action, "register");

const appHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(appSource, /let KEY='saymosaldo_';/, "The active storage key must be mutable for per-account isolation");
assert.ok(appSource.includes("KEY='saymosaldo_user_'+userId+'_';"), "Login must switch to the authenticated user's local storage namespace");
assert.ok(appHtml.includes("KEY='saymosaldo_';"), "Logout/reset must return to the guest namespace");
assert.ok(appSource.includes("activate(userId,data,updatedAt,pendingSync){"), "The app must expose a single account activation path");
assert.ok(appSource.includes("entries[scopedKey('pending_sync')]"), "Local account data must track pending cloud synchronization");
assert.ok(appHtml.includes('id="authLoginForm"') && appHtml.includes('id="authRegisterForm"') && appHtml.includes('id="authResetForm"'), "Login, registration, and recovery forms must all be present");
assert.ok(source.includes("credentials: 'omit'"), "Auth requests must not send ambient browser credentials");
assert.ok(source.indexOf("raw = await response.text()") < source.indexOf("clearTimeout(timeout)"), "The request deadline must cover response-body reading");
assert.ok(edgeSource.includes('"https://11saymo.github.io"'), "The production site must be allowed by Edge Function CORS");


assert.ok(!appHtml.includes("Регистрация не требуется. Данные хранятся в браузере этого устройства."), "Public app copy must not describe the account-based app as guest-only");
assert.ok(appSource.includes("Данные аккаунта синхронизируются между вашими устройствами."), "Account settings must disclose cloud synchronization");

  console.log("Auth client and account-isolation contract tests passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

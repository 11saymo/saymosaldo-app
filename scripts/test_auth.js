const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
const edgeSource = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "username-auth", "index.ts"), "utf8");
const migrationSource = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261122000000_username_recovery_codes.sql"), "utf8");
const supabaseConfig = fs.readFileSync(path.join(__dirname, "..", "supabase", "config.toml"), "utf8");
for (const required of [
  "email_confirm: true",
  "consume_username_registration_attempt",
  "rate_limited",
  "username_recovery_codes",
  "crypto.getRandomValues",
  "crypto.subtle.digest",
  "constantTimeEqual",
  "updateUserById"
]) assert.ok(edgeSource.includes(required), "Edge function missing security requirement: " + required);
assert.ok(migrationSource.includes("enable row level security"));
assert.ok(migrationSource.includes("revoke all on table public.username_recovery_codes from public, anon, authenticated"));
assert.ok(supabaseConfig.includes("verify_jwt = false"));
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
  console.log("Auth client unit tests passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

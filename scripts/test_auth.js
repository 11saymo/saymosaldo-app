const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const auth = fs.readFileSync(path.join(root, "auth.js"), "utf8");
const edge = fs.readFileSync(path.join(root, "supabase/functions/username-auth/index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).join("\n");

assert.ok(html.includes('id="googleSignInButton"'), "Google sign-in button must be present");
assert.ok(html.includes('id="authRegisterForm"') && html.includes('id="authResetForm"'), "Legacy forms must remain hidden for backward-compatible markup");
assert.ok(auth.includes("googleAuthorizeUrl") && auth.includes("code_challenge_method"), "Google OAuth must use PKCE");
assert.ok(auth.includes("sessionStorage.setItem(GOOGLE_PKCE_KEY, verifier)"), "PKCE verifier must be tab-scoped");
assert.ok(auth.includes("credentials: 'omit'"), "Auth requests must omit ambient browser credentials");
assert.ok(auth.includes("rest/v1/user_data"), "Cloud sync must use the authenticated user data table");
assert.ok(edge.includes('ALLOWED_ORIGIN = "https://munora.ru"'), "Retired endpoint must allow only the production origin");
assert.ok(edge.includes("legacy_auth_retired") && edge.includes("status: 410"), "Legacy password endpoint must stay retired");
assert.ok(!edge.includes("SUPABASE_SERVICE_ROLE_KEY") && !edge.includes("createUser"), "Retired function must not contain privileged auth operations");
assert.ok(config.includes("verify_jwt = true"), "Retired endpoint must still require a valid JWT");
assert.ok(migrations.includes("user_data") && migrations.includes("user_data_backups"), "Data and backup migrations must remain in source control");
assert.ok(!auth.includes("sb_secret_") && !auth.includes("service_role"), "Public auth client must not contain privileged keys");

console.log("Google OAuth and account-isolation contract tests passed.");

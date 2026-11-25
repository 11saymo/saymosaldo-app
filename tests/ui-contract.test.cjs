const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('all main application views and navigation targets are present', () => {
  for (const view of ['home', 'ops', 'add', 'stats', 'more']) {
    assert.match(html, new RegExp('data-view="' + view + '"'));
    assert.match(html, new RegExp('data-go="' + view + '"'));
  }
  for (const tab of ['assistant', 'settings', 'data']) {
    assert.match(html, new RegExp('data-tab="' + tab + '"'));
  }
});

test('authentication entry points and financial input remain available', () => {
  assert.match(html, /id="googleSignInButton"/);
  assert.match(html, /data-auth-action="google"/);
  assert.match(html, /id="authLoginForm"/);
  assert.doesNotMatch(html, /authRegisterForm|authResetForm|recoveryPanel/);
  assert.match(html, /Сумма, ₽/);
  assert.match(html, /Общий баланс/);
  assert.doesNotMatch(html, /За месяц|За всё время|За все время/);
});

test('responsive visual system covers phone, desktop, theme, and reduced motion', () => {
  assert.match(html, /MUNORA emerald identity refresh/);
  assert.ok(html.includes('.auth-card'), 'authentication screen must use the emerald brand design');
  assert.match(html, /@media\s*\(max-width:\s*759px\)/);
  assert.match(html, /@media\s*\(min-width:\s*760px\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /:root\[data-theme=dark\]/);
  for (const selector of ['#homeDebts', '#homeGoals', '#homeLimits', '#recent', '#panel', '#budgetWrap']) {
    assert.ok(html.includes(selector), 'responsive styling must cover ' + selector);
  }
});

test('the app loads only approved first-party scripts and no external stylesheet', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  assert.deepEqual(scripts, ['./app.js', './auth.js', './learning.js']);
  assert.ok(!html.includes('app.js?') && !html.includes('auth.js?') && !html.includes('learning.js?'));
  assert.doesNotMatch(html, /<link\b[^>]*rel="stylesheet"[^>]*href="https?:/i);
});


test('the product introduction appears only in a one-time first-login screen', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(html, /class="seo-intro"/);
  assert.match(app, /function showWelcome\(\)/);
  assert.match(app, /welcome-screen/);
  assert.match(app, /KEY\+'intro_v1'/);
  assert.match(app, /localStorage\.setItem\(KEY\+'intro_v1','shown'\)/);
  assert.match(app, /Политика конфиденциальности/);
  assert.match(app, /Условия использования/);
});


test('More navigation shows only assistant, settings, and data', () => {
  const marker = '<section class="view" data-view="more"';
  const start = html.indexOf(marker);
  const more = html.slice(start, html.indexOf('</section>', start));
  assert.match(more, /data-tab="assistant"/);
  assert.match(more, /data-tab="settings"/);
  assert.match(more, /data-tab="data"/);
  assert.doesNotMatch(more, /data-tab="recurring"|data-tab="debts"/);
  assert.doesNotMatch(html, /data-tab-target="debts"/);
});


test('home dashboard is compact by default and detailed metrics are collapsed', () => {
  const start = html.indexOf('<section class="view" data-view="home">');
  const end = html.indexOf('<section class="view" data-view="ops"', start);
  const home = html.slice(start, end);
  assert.ok(home.indexOf('id="recent"') < home.indexOf('<details class="home-details">'));
  assert.match(home, /<details class="home-details">/);
  for (const id of ['status', 'moneyInsight', 'homeWeekCard', 'homeLimits', 'homeGoals', 'homeDebts']) {
    assert.match(home, new RegExp('id="' + id + '"'));
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /рады видеть вас в MUNORA/);
});

test('returning visitors see a branded boot screen before a sign-in decision', () => {
  const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
  assert.match(html, /id="appBoot"/);
  assert.match(html, /id="authRoot"[^>]*hidden/);
  assert.match(html, /<nav class="nav"[^>]*hidden/);
  const start = auth.indexOf('async function bootstrap()');
  const end = auth.indexOf('function bindUi()', start);
  const bootstrap = auth.slice(start, end);
  assert.doesNotMatch(bootstrap, /^async function bootstrap\(\)\s*\{\s*showAuth\(\);/);
  assert.match(bootstrap, /if \(!session\)/);
  assert.match(bootstrap, /showAuth\(true\)/);
  assert.match(auth, /function showAuth\(preserveNotice = false\)/);
});


test('the More data panel exposes the account automatic-backup list', () => {
  assert.match(app, /id="serverBackups"/);
  assert.match(app, /data-act="backups-refresh"/);
  assert.match(app, /data-act="backup-restore"/);
  assert.match(app, /function loadServerBackups\(\)/);
});

test('learning tour no longer references removed payments and debt tabs', () => {
  const start = app.indexOf('const TOUR=[');
  const end = app.indexOf('];', start);
  const tour = app.slice(start, end);
  assert.doesNotMatch(tour, /tab:'recurring'|tab:'debts'/);
  assert.match(tour, /tab:'assistant'/);
  assert.match(tour, /tab:'data'/);
});

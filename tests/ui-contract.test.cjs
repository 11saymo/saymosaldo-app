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
  for (const tab of ['recurring', 'debts', 'assistant', 'settings', 'data']) {
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

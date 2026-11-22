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
  for (const id of ['authLoginForm', 'authRegisterForm', 'authResetForm']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Сумма, ₽/);
  assert.match(html, /Общий баланс/);
  assert.doesNotMatch(html, /За месяц|За всё время|За все время/);
});

test('responsive visual system covers phone, desktop, theme, and reduced motion', () => {
  assert.match(html, /SaymoSaldo visual system v2/);
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
  assert.match(html, /app\\.js\\?v=45/);
  assert.match(html, /auth\\.js\\?v=45/);
  assert.match(html, /learning\\.js\\?v=45/);
  assert.doesNotMatch(html, /<link\b[^>]*rel="stylesheet"[^>]*href="https?:/i);
});

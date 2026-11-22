const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Ice Glass design tokens replace the old burgundy visual identity', () => {
  assert.match(html, /SAYMOSALDO ICE GLASS/);
  for (const token of ['--bg:#edf2f7', '--ice:#a9d8ff', '--ice-strong:#4d9fe8', '--bg:#080d16']) {
    assert.ok(html.includes(token), 'missing design token ' + token);
  }
  assert.doesNotMatch(html, /--acc:#7a1f2b/);
});

test('light and dark glass themes respect explicit and system preferences', () => {
  assert.match(html, /:root\[data-theme=light\]/);
  assert.match(html, /:root\[data-theme=dark\]/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /backdrop-filter:\s*blur\(/);
  assert.match(html, /-webkit-backdrop-filter:\s*blur\(/);
});

test('all key app surfaces receive the Ice Glass design layer', () => {
  for (const selector of ['.hero', '.card', '.item', '.auth-card', '.nav', '.tabs', '.qbtn', '.primary']) {
    assert.ok(html.includes(selector), 'missing styled surface ' + selector);
  }
  assert.match(html, /linear-gradient\(135deg,#bfe4ff,#78b9ef\)/);
});

test('mobile, desktop, safe areas and reduced-motion behavior remain covered', () => {
  assert.match(html, /@media\(min-width:760px\)/);
  assert.match(html, /@media\(max-width:759px\)/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});

test('visual refresh does not replace app scripts or change currency contract', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['./app.js', './auth.js', './learning.js']);
  assert.match(html, /Сумма, ₽/);
  assert.doesNotMatch(html, /За месяц|За всё время|За все время/);
});

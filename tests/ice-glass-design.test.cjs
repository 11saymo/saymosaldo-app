const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const learning = fs.readFileSync(path.join(root, 'learning.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('Munora burgundy visual direction is restored', () => {
  assert.match(html, /MUNORA burgundy visual system restored/);
  assert.match(html, /--acc:#7a1f2b/);
  assert.match(html, /--bg:#f5f5f3/);
  assert.match(html, /rgba\(122,31,43/);
  assert.match(html, /\.auth-screen/);
  assert.match(html, /\.auth-card/);
  assert.match(html, /\.auth-mark/);
});

test('light and dark themes and responsive behavior remain present', () => {
  assert.match(html, /:root\[data-theme=dark\]/);
  assert.match(html, /@media\s*\(max-width:\s*759px\)/);
  assert.match(html, /@media\s*\(min-width:\s*760px\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});

test('learning overlay uses the burgundy theme', () => {
  assert.match(learning, /#7a1f2b|#852d3a|#5a1724|#3e1420|rgba\(122,31,43/);
  assert.doesNotMatch(learning, /#dceefa|#b8d6eb|#5799c9/);
});

test('PWA assets refresh with the burgundy theme', () => {
  assert.equal(manifest.theme_color, '#7a1f2b');
  assert.equal(manifest.background_color, '#f5f5f3');
  assert.match(sw, /munora-v51/);
  assert.match(sw, /fetch\(e\.request,\{cache:'no-store'\}\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(app, /updateViaCache:'none'/);
});

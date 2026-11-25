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

test('MUNORA emerald visual direction is applied', () => {
  assert.match(html, /MUNORA emerald identity refresh/);
  assert.match(html, /--acc:#12b981/);
  assert.match(html, /--bg:#f4f8f6/);
  assert.match(html, /rgba\(18,185,129/);
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

test('learning overlay uses the emerald theme', () => {
  assert.match(learning, /#7a1f2b|#852d3a|#5a1724|#3e1420|rgba\(18,185,129/);
  assert.doesNotMatch(learning, /#dceefa|#b8d6eb|#5799c9/);
});

test('PWA assets refresh with the emerald theme', () => {
  assert.equal(manifest.theme_color, '#12b981');
  assert.equal(manifest.background_color, '#07110e');
  assert.match(sw, /munora-v52/);
  assert.match(sw, /fetch\(e\.request,\{cache:'no-store'\}\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(app, /updateViaCache:'none'/);
});

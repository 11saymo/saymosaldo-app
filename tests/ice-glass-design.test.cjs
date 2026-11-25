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
  assert.match(learning, /#12b981|#0d9f73|#087452|#064b39|rgba\(18,185,129/);
  assert.doesNotMatch(learning, /#dceefa|#b8d6eb|#5799c9/);
});

test('PWA assets refresh with the emerald theme', () => {
  assert.equal(manifest.theme_color, '#12b981');
  assert.equal(manifest.background_color, '#07110e');
  assert.match(sw, /munora-v58/);
  assert.match(sw, /fetch\(e\.request,\{cache:'no-store'\}\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(app, /updateViaCache:'none'/);
});

test('learning panel keeps its header, section tabs, lesson body, and footer in separate rows', () => {
  assert.match(learning, /display:grid;grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(learning, /\.ss-tabs\{position:relative;z-index:2;display:flex;flex:0 0 auto/);
  assert.match(learning, /\.ss-content\{position:relative;z-index:1;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto/);
  assert.match(learning, /\.ss-head,#ssLearning \.ss-tabs,#ssLearning \.ss-foot\{min-width:0;flex-shrink:0/);
});

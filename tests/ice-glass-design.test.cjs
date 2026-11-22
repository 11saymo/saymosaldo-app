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

test('Soft Blue Banking is the active visual direction', () => {
  assert.match(html, /SAYMOSALDO SOFT BLUE BANKING/);
  assert.match(html, /--bg:#f3f7fc/);
  assert.match(html, /--acc:#6ba7dc/);
  assert.match(html, /--ice:#dceeff/);
  assert.match(html, /Banking UI — consistent components across every SaymoSaldo section/);
  assert.match(html, /Soft Blue Banking — final authentication and global consistency pass/);
});

test('login, registration and recovery screens use the same soft-blue design', () => {
  for (const selector of ['#authRoot.auth-screen', '#authRoot .auth-card', '#authRoot .auth-mark', '#authRoot .primary']) {
    assert.ok(html.includes(selector), 'missing auth styling: ' + selector);
  }
  const finalLayer = html.slice(html.indexOf('Soft Blue Banking — final authentication'), html.indexOf('</style>'));
  assert.match(finalLayer, /radial-gradient/);
  assert.match(finalLayer, /#5799c9/);
  assert.match(finalLayer, /:root\[data-theme=dark\]/);
  assert.doesNotMatch(finalLayer, /#7a1f2b|#852d3a|#5a1724|#3e1420/);
});

test('light and dark banking themes and responsive behavior are present', () => {
  assert.match(html, /:root\[data-theme=light\]/);
  assert.match(html, /:root\[data-theme=dark\]/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /@media\(min-width:760px\)/);
  assert.match(html, /@media\(max-width:759px\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});

test('learning overlay keeps the same blue visual language', () => {
  assert.match(learning, /linear-gradient\(132deg,rgba\(67,91,119/);
  assert.match(learning, /linear-gradient\(135deg,#dceefa,#b8d6eb\)/);
  assert.doesNotMatch(learning, /#852d3a|#5a1724|#3e1420/);
});

test('PWA manifest and service worker refresh the published visual assets', () => {
  assert.equal(manifest.theme_color, '#eef5fc');
  assert.equal(manifest.background_color, '#f3f7fc');
  assert.match(sw, /saymosaldo-v47/);
  assert.match(sw, /fetch\(e\.request,\{cache:'no-store'\}\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(app, /updateViaCache:'none'/);
});

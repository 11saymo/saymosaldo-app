const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const learning = fs.readFileSync(path.join(__dirname, '..', 'learning.js'), 'utf8');

test('Ice Glass design tokens use the softer silver-blue palette', () => {
  assert.match(html, /SAYMOSALDO ICE GLASS/);
  for (const token of ['--bg:#f4f7fb', '--ice:#d5eafa', '--ice-strong:#83afd2', '--bg:#111a27']) {
    assert.ok(html.includes(token), 'missing design token ' + token);
  }
  const layer = html.slice(html.indexOf('SAYMOSALDO ICE GLASS'), html.indexOf('</style>'));
  assert.doesNotMatch(layer, /#7a1f2b|#4a0f1a|burgundy|rgba\(122,31,43/i);
  assert.match(layer, /body::before/);
  assert.match(layer, /rgba\(160,199,236/);
});

test('rounded TT Travels-inspired typography and softer metallic palette are present', () => {
  assert.match(html, /font-family:\s*"TT Travels","Avenir Next",Avenir,"Manrope","Segoe UI",sans-serif/);
  assert.match(html, /#f4f7fb/);
  assert.match(html, /#d5eafa/);
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
  assert.match(html, /linear-gradient\(135deg,#dceefa,#b8d6eb\)/);
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

test('onboarding overlay uses the same Ice Glass visual language', () => {
  assert.match(learning, /linear-gradient\(132deg,rgba\(67,91,119/);
  assert.match(learning, /linear-gradient\(135deg,#dceefa,#b8d6eb\)/);
  assert.doesNotMatch(learning, /#852d3a|#5a1724|#3e1420/);
});

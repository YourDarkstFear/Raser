const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');
const STYLES_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');

const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');
const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');

test('Challenger M3 - Titlebar Button Geometry & State Invariants Suite', async (t) => {
  await t.test('index.html: window controls contain all 5 buttons and NO win-btn classes', () => {
    const controlsMatch = htmlContent.match(/<div class="[^"]*window-controls[^"]*">([\s\S]*?)<\/div>/);
    assert.ok(controlsMatch, 'window-controls container must exist in index.html');
    const controlsHtml = controlsMatch[1];

    const expectedButtons = [
      '#btn-mini-lyrics',
      '#btn-mini-player',
      '#btn-minimize',
      '#btn-maximize',
      '#btn-close'
    ];

    for (const btnId of expectedButtons) {
      assert.ok(controlsHtml.includes(`id="${btnId.slice(1)}"`), `Button ${btnId} must be present in window-controls`);
    }

    // Win-btn class must NOT be present anywhere in window-controls
    assert.doesNotMatch(controlsHtml, /class=["'][^"']*win-btn[^"']*["']/, 'win-btn class must be completely removed from buttons');
  });

  await t.test('styles.css: titlebar-btn base geometry enforces uniform 30px x 30px pill circles', () => {
    const btnRuleMatch = stylesContent.match(/\.titlebar-btn\s*\{([^}]+)\}/);
    assert.ok(btnRuleMatch, '.titlebar-btn rule must be defined');
    const ruleBody = btnRuleMatch[1];

    assert.match(ruleBody, /width:\s*30px;/, '.titlebar-btn must define width: 30px');
    assert.match(ruleBody, /height:\s*30px;/, '.titlebar-btn must define height: 30px');
    assert.match(ruleBody, /min-width:\s*30px;/, '.titlebar-btn must define min-width: 30px to prevent flex squishing');
    assert.match(ruleBody, /border-radius:\s*var\(--md-shape-corner-full,\s*9999px\);/, '.titlebar-btn must use pill border-radius');
    assert.match(ruleBody, /display:\s*inline-flex;/, '.titlebar-btn must be inline-flex');
    assert.match(ruleBody, /align-items:\s*center;/, 'must align items center');
    assert.match(ruleBody, /justify-content:\s*center;/, 'must justify content center');
    assert.match(ruleBody, /-webkit-app-region:\s*no-drag\s*!important;/, 'must be no-drag to guarantee clickability');
  });

  await t.test('styles.css: hover, active, and pressed state styling and color feedback', () => {
    // Normal hover
    assert.match(stylesContent, /\.titlebar-btn:hover\s*\{[\s\S]*?background:\s*var\(--md-sys-color-surface-container-high\);/);
    assert.match(stylesContent, /\.titlebar-btn:hover\s*\{[\s\S]*?color:\s*var\(--md-sys-color-on-surface\);/);

    // Close button red hover
    assert.match(stylesContent, /\.titlebar-btn\.close-btn:hover\s*\{[\s\S]*?background:\s*var\(--md-sys-color-error\);/);
    assert.match(stylesContent, /\.titlebar-btn\.close-btn:hover\s*\{[\s\S]*?color:\s*var\(--md-sys-color-on-error\);/);

    // Active state
    assert.match(stylesContent, /\.titlebar-btn:active/);
    assert.match(stylesContent, /transform:\s*none;/);

    // Pressed state
    assert.match(stylesContent, /\.titlebar-btn.*\.pressed\s*\{\s*--hl:\s*12%;\s*\}/);
  });

  await t.test('styles.css: mini mode titlescale shrinks titlebar buttons to 24px x 24px', () => {
    const miniBtnMatch = stylesContent.match(/body\.mini\s+\.titlebar-btn\s*\{([^}]+)\}/);
    assert.ok(miniBtnMatch, 'body.mini .titlebar-btn rule must be defined');
    const miniRule = miniBtnMatch[1];
    assert.match(miniRule, /width:\s*24px;/);
    assert.match(miniRule, /height:\s*24px;/);
  });

  await t.test('styles.css: platform-darwin hides minimize/maximize/close while Linux and Windows keep them visible', () => {
    assert.match(stylesContent, /\.platform-darwin\s+#btn-minimize,\s*\.platform-darwin\s+#btn-maximize,\s*\.platform-darwin\s+#btn-close\s*\{[^}]*display:\s*none\s*!important;/);

    // Ensure non-darwin does not hide window buttons
    assert.doesNotMatch(stylesContent, /(?<!\.platform-darwin\s+)#btn-close\s*\{[^}]*display:\s*none/);
  });

  await t.test('styles.css: CSS clean audit: no invalid blur: 5 declaration in .ripple or elsewhere', () => {
    assert.doesNotMatch(stylesContent, /blur:\s*5;/, 'Invalid blur: 5; CSS declaration must not exist');
    assert.doesNotMatch(stylesContent, /\.win-btn\s*\{/, 'Obsolete .win-btn CSS rule must not exist');
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const STYLES_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');
const HTML_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');
const APP_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');

const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');
const appContent = fs.readFileSync(APP_PATH, 'utf-8');

// -----------------------------------------------------------------------------
// Suite 1: Feature 12 (E1) - Scrubber Dynamic Theme Accent & Hover Knob Feedback
// -----------------------------------------------------------------------------
test('Suite 1: Feature 12 (E1) - Scrubber Dynamic Accent, Hover Knob & Tooltip', async (t) => {
  await t.test('index.html contains scrubber tooltip element', () => {
    assert.ok(htmlContent.includes('id="scrubber-tooltip"') && htmlContent.includes('class="scrubber-tooltip"'), 'scrubber tooltip element should exist');
  });

  await t.test('styles.css contains scrubber tooltip styling with transitions and positioning', () => {
    assert.match(stylesContent, /\.scrubber-tooltip\s*\{[^}]*position:\s*absolute/);
    assert.match(stylesContent, /\.scrubber-tooltip\s*\{[^}]*pointer-events:\s*none/);
    assert.match(stylesContent, /\.scrubber-tooltip\s*\{[^}]*opacity:\s*0/);
    assert.match(stylesContent, /\.scrubber-tooltip\.visible\s*\{[^}]*opacity:\s*1/);
  });

  await t.test('app.js calculates dynamic high-contrast theme color for waveform', () => {
    assert.match(appContent, /function\s+getHighContrastColor\s*\(/);
    assert.match(appContent, /cachedPrimaryColor/);
  });

  await t.test('app.js implements hover knob feedback scaling on scrubber mouse events', () => {
    assert.match(appContent, /isHoveringScrubber\s*=\s*true/);
    assert.match(appContent, /isHoveringScrubber\s*=\s*false/);
    assert.match(appContent, /targetAnim\s*=\s*\(isDraggingScrubber\s*\|\|\s*isHoveringScrubber\)\s*\?\s*1\s*:\s*0/);
    assert.match(appContent, /curKnobW\s*=\s*7\.5\s*\+\s*\(9\.5\s*-\s*7\.5\)\s*\*\s*scrubKnobAnim/);
    assert.match(appContent, /curKnobH\s*=\s*24\s*\+\s*\(32\s*-\s*24\)\s*\*\s*scrubKnobAnim/);
  });

  await t.test('app.js updates scrubber tooltip timestamp and position on mousemove', () => {
    assert.match(appContent, /tooltip\.textContent\s*=\s*formatDuration\(hoverTime\)/);
    assert.match(appContent, /tooltip\.classList\.add\('visible'\)/);
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Feature 13 (E2) - Volume Slider Progress Fill & Tooltip
// -----------------------------------------------------------------------------
test('Suite 2: Feature 13 (E2) - Volume Slider Progress Fill & Tooltip', async (t) => {
  await t.test('index.html contains volume tooltip element inside volume control group', () => {
    assert.ok(htmlContent.includes('id="volume-tooltip"') && htmlContent.includes('class="volume-tooltip"'), 'volume tooltip element should exist');
  });

  await t.test('styles.css defines dynamic gradient progress fill using --volume-percent', () => {
    assert.match(stylesContent, /--volume-percent/);
    assert.match(stylesContent, /linear-gradient\(\s*to\s+right,\s*var\(--md-sys-color-primary\)\s*0%,\s*var\(--md-sys-color-primary\)\s*var\(--volume-percent,\s*85%\)/);
  });

  await t.test('styles.css implements smooth hover width expansion for volume slider', () => {
    assert.match(stylesContent, /\.volume-slider-wrapper\s*\{[^}]*width:\s*80px/);
    assert.match(stylesContent, /\.volume-slider-wrapper:hover[^}]*width:\s*110px/);
  });

  await t.test('styles.css defines volume tooltip badge with pointer-events: none', () => {
    assert.match(stylesContent, /\.volume-tooltip\s*\{[^}]*pointer-events:\s*none/);
    assert.match(stylesContent, /\.volume-tooltip\s*\{[^}]*opacity:\s*0/);
    assert.match(stylesContent, /\.volume-tooltip\.visible\s*\{[^}]*opacity:\s*1/);
  });

  await t.test('app.js defines updateVolumeProgressFill to sync CSS variable and tooltip', () => {
    assert.match(appContent, /function\s+updateVolumeProgressFill\s*\(/);
    assert.match(appContent, /setProperty\('--volume-percent'/);
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Feature 14 (E3) - Responsive Lyrics Drawer on Small Screens
// -----------------------------------------------------------------------------
test('Suite 3: Feature 14 (E3) - Responsive Lyrics Drawer (< 1020px)', async (t) => {
  await t.test('styles.css does NOT hide right-panel with display: none on small screens', () => {
    assert.doesNotMatch(stylesContent, /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[^}]*body:not\(\.mini\)\s+\.right-panel\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  await t.test('styles.css configures right-panel as slide-over drawer with transform and shadow', () => {
    assert.match(stylesContent, /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[\s\S]*?\.right-panel\s*\{[\s\S]*?position:\s*fixed/);
    assert.match(stylesContent, /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[\s\S]*?\.right-panel\.hidden\s*\{[\s\S]*?transform:\s*translateX\(100%\)/);
    assert.match(stylesContent, /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[\s\S]*?\.right-panel\s*\{[\s\S]*?transform:\s*translateX\(0\)/);
    assert.match(stylesContent, /box-shadow:\s*-8px\s+0\s+32px\s+rgba\(0,\s*0,\s*0,\s*0\.45\)/);
  });
});

// -----------------------------------------------------------------------------
// Suite 4: Feature 15 (E4) - Playing Track Row Animated Visualizer
// -----------------------------------------------------------------------------
test('Suite 4: Feature 15 (E4) - Track Row Equalizer Bars Visualizer', async (t) => {
  await t.test('styles.css defines .playing-equalizer-bars and 3 staggered bounce bars', () => {
    assert.match(stylesContent, /\.playing-equalizer-bars\s*\{/);
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-1\s*\{/);
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-2\s*\{/);
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-3\s*\{/);
    assert.match(stylesContent, /@keyframes\s+eq-bounce/);
  });

  await t.test('styles.css pauses animation when track or audio is paused', () => {
    assert.match(stylesContent, /\.track-row\.playing\.paused\s+\.eq-bar/);
    assert.match(stylesContent, /animation-play-state:\s*paused/);
  });

  await t.test('app.js renders equalizer bars in createTrackRow', () => {
    assert.match(appContent, /playing-equalizer-bars/);
    assert.match(appContent, /eq-bar\s+eq-bar-1/);
    assert.match(appContent, /eq-bar\s+eq-bar-2/);
    assert.match(appContent, /eq-bar\s+eq-bar-3/);
  });

  await t.test('app.js highlights playing track and toggles paused state on equalizer', () => {
    assert.match(appContent, /highlightPlayingRow/);
    assert.match(appContent, /classList\.toggle\('paused',\s*!state\.isPlaying\)/);
  });
});

// -----------------------------------------------------------------------------
// Suite 5: Feature 16 (E5) - Acrylic Frosted Glass Playbar
// -----------------------------------------------------------------------------
test('Suite 5: Feature 16 (E5) - Acrylic Frosted Glass Playbar', async (t) => {
  await t.test('styles.css applies backdrop-filter blur and saturation to fixed bottom playbar', () => {
    assert.match(stylesContent, /body:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{[\s\S]*?backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important/);
    assert.match(stylesContent, /body:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{[\s\S]*?-webkit-backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important/);
  });

  await t.test('styles.css keeps frosted playbar borderless without harsh outline', () => {
    assert.match(stylesContent, /body:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{[\s\S]*?border-top:\s*none\s*!important/);
  });

  await t.test('styles.css disables backdrop blur in performance mode', () => {
    assert.match(stylesContent, /body\.perf:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important/);
  });
});

// -----------------------------------------------------------------------------
// Suite 6: Feature 17 & 18 (E6, E7, E8, E10) - Titlebar, Icon Pack & Empty States
// -----------------------------------------------------------------------------
test('Suite 6: Feature 17 & 18 - Titlebar Controls, Icon Pack Switcher & Empty States', async (t) => {
  await t.test('index.html titlebar buttons do not have conflicting win-btn class', () => {
    const titlebarMatch = htmlContent.match(/<div class="[^"]*window-controls[^"]*">([\s\S]*?)<\/div>/);
    assert.ok(titlebarMatch, 'window-controls element should exist');
    assert.doesNotMatch(titlebarMatch[1], /class="[^"]*win-btn[^"]*"/, 'Buttons must not contain win-btn class');
    assert.match(titlebarMatch[1], /id="btn-minimize"/);
    assert.match(titlebarMatch[1], /id="btn-maximize"/);
    assert.match(titlebarMatch[1], /id="btn-close"/);
  });

  await t.test('styles.css defines clean titlebar button geometry and hover transitions', () => {
    assert.match(stylesContent, /\.titlebar-btn\s*\{[\s\S]*?width:\s*30px;/);
    assert.match(stylesContent, /\.titlebar-btn\s*\{[\s\S]*?height:\s*30px;/);
    assert.match(stylesContent, /\.titlebar-btn\s*\{[\s\S]*?border-radius:\s*var\(--md-shape-corner-full/);
  });

  await t.test('styles.css does not contain invalid blur: 5 declaration in .ripple', () => {
    assert.doesNotMatch(stylesContent, /blur:\s*5;/);
  });

  await t.test('styles.css defines empty-state-card layout, badge, title, and subtitle styles', () => {
    assert.match(stylesContent, /\.empty-state-card\s*\{/);
    assert.match(stylesContent, /\.empty-state-badge\s*\{[\s\S]*?width:\s*72px;/);
    assert.match(stylesContent, /\.empty-state-title\s*\{/);
    assert.match(stylesContent, /\.empty-state-sub\s*\{/);
  });

  await t.test('index.html contains initial empty-state-card markup for favorites, history, and queue', () => {
    assert.match(htmlContent, /<div\s+class="tracks-list"\s+id="favorites-tracks-list">\s*<div\s+class="empty-hint\s+empty-state-card">/);
    assert.match(htmlContent, /<div\s+class="tracks-list"\s+id="history-tracks-list">\s*<div\s+class="empty-hint\s+empty-state-card">/);
    assert.match(htmlContent, /<div\s+class="tracks-list"\s+id="queue-tracks-list">\s*<div\s+class="empty-hint\s+empty-state-card">/);
  });

  await t.test('app.js renderTracks creates contextual empty-state-card for empty track lists', () => {
    assert.match(appContent, /const emptyConfigs\s*=\s*\{/);
    assert.match(appContent, /empty-hint empty-state-card/);
    assert.match(appContent, /empty-state-badge/);
    assert.match(appContent, /empty-state-title/);
  });

  await t.test('app.js applyIconPack handles #nav-discover image toggling and SVG rendering', () => {
    assert.match(appContent, /if\s*\(\s*sel\s*===\s*'#nav-discover\s+svg'\s*\)/);
    assert.match(appContent, /nav-discover-pack-svg/);
    assert.match(appContent, /nav-home-app-icon/);
  });
});

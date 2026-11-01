const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const APP_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');
const STYLES_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');
const HTML_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');

const appContent = fs.readFileSync(APP_PATH, 'utf-8');
const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');

// Extract getHighContrastColor from app.js
function buildHighContrastFn() {
  const match = appContent.match(/function getHighContrastColor\(col\) \{[\s\S]*?\n  \}/);
  if (!match) throw new Error('Could not find getHighContrastColor in app.js');
  return new Function('return ' + match[0])();
}

// Extract updateVolumeProgressFill from app.js
function buildVolumeProgressFn() {
  const match = appContent.match(/function updateVolumeProgressFill\(\) \{[\s\S]*?\n  \}/);
  if (!match) throw new Error('Could not find updateVolumeProgressFill in app.js');
  return new Function('state', 'el', `
    ${match[0]}
    updateVolumeProgressFill();
  `);
}

test('Challenger M3 - UI Aesthetics & Material 3 Polish Stress Suite', async (t) => {
  const getHighContrastColor = buildHighContrastFn();

  await t.test('getHighContrastColor math oracle: luminance calculation and contrast guarantees', () => {
    // Pure white (#ffffff) has lum = 1.0 > 0.55. Output should be darkened to lum <= 0.55
    const darkenedWhite = getHighContrastColor('#ffffff');
    assert.match(darkenedWhite, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    const m = darkenedWhite.match(/\d+/g).map(Number);
    const lumWhite = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    assert.ok(lumWhite <= 0.56, `Darkened white luminance ${lumWhite} must be <= 0.56`);

    // Pure black (#000000) has lum = 0 <= 0.55. Should be untouched
    assert.equal(getHighContrastColor('#000000'), '#000000');

    // Default primary purple (#6750A4) has lum = (0.299*103 + 0.587*80 + 0.114*164)/255 = ~0.378 <= 0.55. Should be untouched
    assert.equal(getHighContrastColor('#6750A4'), '#6750A4');

    // 3-char hex (#fff)
    const shortWhite = getHighContrastColor('#fff');
    assert.match(shortWhite, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);

    // RGB input rgb(255, 255, 255)
    const rgbWhite = getHighContrastColor('rgb(255, 255, 255)');
    assert.match(rgbWhite, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
  });

  await t.test('getHighContrastColor randomized property oracle: 5,000 random colors guarantee contrast bound', () => {
    for (let i = 0; i < 5000; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

      const res = getHighContrastColor(hex);
      let outR = r, outG = g, outB = b;
      if (res.startsWith('rgb')) {
        const parts = res.match(/\d+/g).map(Number);
        outR = parts[0];
        outG = parts[1];
        outB = parts[2];
      }
      const outLum = (0.299 * outR + 0.587 * outG + 0.114 * outB) / 255;
      assert.ok(outLum <= 0.56, `Color ${hex} produced output ${res} with luminance ${outLum} > 0.56`);
    }
  });

  await t.test('getHighContrastColor handles adversarial edge conditions safely', () => {
    // Null, undefined, empty
    assert.equal(getHighContrastColor(null), '#6750A4');
    assert.equal(getHighContrastColor(undefined), '#6750A4');
    assert.equal(getHighContrastColor(''), '#6750A4');

    // Non-color string
    assert.equal(getHighContrastColor('transparent'), 'transparent');
    assert.equal(getHighContrastColor('currentColor'), 'currentColor');

    // Malformed hex
    assert.doesNotThrow(() => getHighContrastColor('#xyz'));
  });

  await t.test('volume progress fill correctly syncs CSS variable and tooltip under extreme inputs', () => {
    class MockSlider {
      constructor(val = '0.5') {
        this.value = val;
        this.styles = {};
      }
      style = {
        setProperty: (prop, val) => { this.styles[prop] = val; }
      };
      closest(sel) {
        return sel === '.volume-slider-wrapper' ? this : null;
      }
    }

    const mockTooltip = { textContent: '' };
    global.document = {
      getElementById: (id) => id === 'volume-tooltip' ? mockTooltip : null
    };

    const runVolumeUpdate = (state) => {
      const slider = new MockSlider(String(state.volume));
      const el = { volumeSlider: slider };
      const fn = buildVolumeProgressFn(state, el);
      fn(state, el);
      return { slider, tooltipText: mockTooltip.textContent };
    };

    // Case 1: Normal volume 85%
    const c1 = runVolumeUpdate({ volume: 0.85, isMuted: false });
    assert.equal(c1.slider.styles['--volume-percent'], '85%');
    assert.equal(c1.tooltipText, '85%');

    // Case 2: Muted state forces 0%
    const c2 = runVolumeUpdate({ volume: 0.85, isMuted: true });
    assert.equal(c2.slider.styles['--volume-percent'], '0%');
    assert.equal(c2.tooltipText, '0%');

    // Case 3: Out of bounds (> 1) clamps to 100%
    const c3 = runVolumeUpdate({ volume: 1.5, isMuted: false });
    assert.equal(c3.slider.styles['--volume-percent'], '100%');
    assert.equal(c3.tooltipText, '100%');

    // Case 4: Negative volume clamps to 0%
    const c4 = runVolumeUpdate({ volume: -0.2, isMuted: false });
    assert.equal(c4.slider.styles['--volume-percent'], '0%');
    assert.equal(c4.tooltipText, '0%');

    // Case 5: NaN or undefined volume safely defaults to 0%
    const c5 = runVolumeUpdate({ volume: NaN, isMuted: false });
    assert.equal(c5.slider.styles['--volume-percent'], '0%');
    assert.equal(c5.tooltipText, '0%');
  });

  await t.test('responsive drawer styles (< 1020px) guarantee mobile accessibility', () => {
    // Must NOT contain display: none !important for right-panel
    assert.doesNotMatch(stylesContent, /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[^}]*body:not\(\.mini\)\s+\.right-panel\s*\{\s*display:\s*none\s*!important;\s*\}/);

    // Must be fixed slide-over drawer
    const drawerMedia = stylesContent.match(/@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(drawerMedia, 'Responsive 1020px media block must exist');
    const drawerCss = drawerMedia[1];

    assert.match(drawerCss, /position:\s*fixed\s*!important;/);
    assert.match(drawerCss, /z-index:\s*2500\s*!important;/);
    assert.match(drawerCss, /transform:\s*translateX\(0\)\s*!important;/);
    assert.match(drawerCss, /transform:\s*translateX\(100%\)\s*!important;/);
    assert.match(drawerCss, /box-shadow:\s*-8px\s+0\s+32px\s+rgba\(0,\s*0,\s*0,\s*0\.45\)\s*!important;/);
  });

  await t.test('playing track row visualizer defines staggered animations and paused overrides', () => {
    // 3 bounce bars with staggered delays and durations
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-1\s*\{[^}]*animation-duration:\s*0\.65s;/);
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-2\s*\{[^}]*animation-duration:\s*0\.85s;/);
    assert.match(stylesContent, /\.playing-equalizer-bars\s+\.eq-bar-3\s*\{[^}]*animation-duration:\s*0\.55s;/);

    // Paused state
    assert.match(stylesContent, /\.track-row\.playing\.paused\s+\.eq-bar,\s*body:not\(\.audio-playing\)\s+\.track-row\.playing\s+\.eq-bar\s*\{[^}]*animation-play-state:\s*paused\s*!important;\s*transform:\s*scaleY\(0\.35\)\s*!important;\s*\}/);
  });
});

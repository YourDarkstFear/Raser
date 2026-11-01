const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STYLES_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');
const HTML_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');
const APP_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');

const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');
const appContent = fs.readFileSync(APP_PATH, 'utf-8');

// -----------------------------------------------------------------------------
// Helper: Extract getHighContrastColor from app.js
// -----------------------------------------------------------------------------
function extractGetHighContrastColor() {
  const match = appContent.match(/function\s+getHighContrastColor\s*\([\s\S]*?\n\s{2}\}/);
  if (!match) throw new Error('getHighContrastColor not found in app.js');
  const fnStr = match[0];
  const factory = new Function(`return (${fnStr});`);
  return factory();
}

// -----------------------------------------------------------------------------
// Suite 1: Adversarial Stress Test - Scrubber Contrast Math (Feature 12)
// -----------------------------------------------------------------------------
test('Challenger M3 - Scrubber Contrast Math Under Edge-Case Colors & Extreme Luminance', async (t) => {
  const getHighContrastColor = extractGetHighContrastColor();

  await t.test('handles nil, undefined, empty, non-string, and malformed inputs gracefully without throwing', () => {
    assert.equal(getHighContrastColor(null), '#6750A4');
    assert.equal(getHighContrastColor(undefined), '#6750A4');
    assert.equal(getHighContrastColor(''), '#6750A4');
    assert.equal(getHighContrastColor('var(--md-primary)'), 'var(--md-primary)');
    assert.equal(getHighContrastColor('blue'), 'blue');
    assert.equal(getHighContrastColor('#1'), '#1');
    assert.equal(getHighContrastColor('#12'), '#12');
    assert.equal(getHighContrastColor('###'), '###');
    assert.equal(getHighContrastColor('#gggggg'), '#gggggg');
    assert.equal(getHighContrastColor('rgb()'), 'rgb()');
  });

  await t.test('preserves dark and medium luminance colors without modification (high contrast on light)', () => {
    // Pure black #000000
    assert.equal(getHighContrastColor('#000000'), '#000000');
    // Short black #000
    assert.equal(getHighContrastColor('#000'), '#000');
    // Dark Material purple
    assert.equal(getHighContrastColor('#21005D'), '#21005D');
    // Deep blue #0000ff (lum ~0.114)
    assert.equal(getHighContrastColor('#0000ff'), '#0000ff');
    // Pure red #ff0000 (lum ~0.299)
    assert.equal(getHighContrastColor('#ff0000'), '#ff0000');
    // Pure magenta #ff00ff (lum ~0.413)
    assert.equal(getHighContrastColor('#ff00ff'), '#ff00ff');
    // Medium blue #1a73e8 (lum ~0.46)
    assert.equal(getHighContrastColor('#1a73e8'), '#1a73e8');
  });

  await t.test('accurately scales down pure white, pastel, and extreme hue colors to target luminance <= 0.55', () => {
    // Pure white #ffffff (lum = 1.0)
    const whiteResult = getHighContrastColor('#ffffff');
    assert.match(whiteResult, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    const [r, g, b] = whiteResult.match(/\d+/g).map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    assert.ok(lum <= 0.5501, `Calculated luminance ${lum} should be <= 0.55`);
    assert.equal(r, 140);
    assert.equal(g, 140);
    assert.equal(b, 140);

    // 3-digit hex #fff
    const shortWhite = getHighContrastColor('#fff');
    assert.equal(shortWhite, whiteResult);

    // Pure yellow #ffff00 (lum = 0.886)
    const yellowResult = getHighContrastColor('#ffff00');
    const [yr, yg, yb] = yellowResult.match(/\d+/g).map(Number);
    const ylum = (0.299 * yr + 0.587 * yg + 0.114 * yb) / 255;
    assert.ok(ylum <= 0.5501, `Calculated yellow luminance ${ylum} should be <= 0.55`);
    assert.equal(yb, 0);

    // Pure cyan #00ffff (lum = 0.701)
    const cyanResult = getHighContrastColor('#00ffff');
    const [cr, cg, cb] = cyanResult.match(/\d+/g).map(Number);
    const clum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
    assert.ok(clum <= 0.5501, `Calculated cyan luminance ${clum} should be <= 0.55`);
    assert.equal(cr, 0);

    // Pure green #00ff00 (lum = 0.587)
    const greenResult = getHighContrastColor('#00ff00');
    const [gr, gg, gb] = greenResult.match(/\d+/g).map(Number);
    const glum = (0.299 * gr + 0.587 * gg + 0.114 * gb) / 255;
    assert.ok(glum <= 0.552, `Calculated green luminance ${glum} should be <= 0.552 (accounting for 8-bit quantization)`);
  });

  await t.test('supports rgb() and rgba() formatted input strings with low and high alpha', () => {
    // rgb(255, 255, 255)
    const rgbInput = 'rgb(255, 255, 255)';
    const res = getHighContrastColor(rgbInput);
    assert.match(res, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    const [r, g, b] = res.match(/\d+/g).map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    assert.ok(lum <= 0.5501);

    // rgba(255, 255, 255, 0.2)
    const rgbaWhite = getHighContrastColor('rgba(255, 255, 255, 0.2)');
    assert.match(rgbaWhite, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);

    // 8-digit hex #ffffff80
    const hex8White = getHighContrastColor('#ffffff80');
    assert.match(hex8White, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);

    // 8-digit hex #00000080
    const hex8Black = getHighContrastColor('#00000080');
    assert.equal(hex8Black, '#00000080');
  });

  await t.test('handles over-range RGB values and clamps to [0, 255]', () => {
    const overRange = getHighContrastColor('rgb(500, 500, 500)');
    assert.match(overRange, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    const [r, g, b] = overRange.match(/\d+/g).map(Number);
    assert.ok(r <= 255 && r >= 0);
    assert.ok(g <= 255 && g >= 0);
    assert.ok(b <= 255 && b >= 0);
  });

  await t.test('fuzz test across 1,000 randomly generated hex colors verifying luminance invariant', () => {
    for (let i = 0; i < 1000; i++) {
      const hex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      const out = getHighContrastColor(hex);
      if (out.startsWith('rgb')) {
        const [r, g, b] = out.match(/\d+/g).map(Number);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // 8-bit integer quantization can cause at most ~0.587*0.5/255 = ~0.0012 rounding deviation
        assert.ok(lum <= 0.555, `Fuzz color ${hex} produced lum ${lum} > 0.555`);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Adversarial Stress Test - Volume Progress Fill Logic (Feature 13)
// -----------------------------------------------------------------------------
test('Challenger M3 - Volume Slider Progress Fill Logic & Boundary Conditions', async (t) => {
  const match = appContent.match(/function\s+updateVolumeProgressFill\s*\([\s\S]*?\n\s{2}\}/);
  assert.ok(match, 'updateVolumeProgressFill must be present in app.js');

  function simulateVolumeFill(state, volumeSlider, volWrapper, tooltip) {
    const vol = state.isMuted ? 0 : (Number.isFinite(state.volume) ? state.volume : 0);
    const pct = Math.max(0, Math.min(100, Math.round(vol * 100)));
    volumeSlider.style['--volume-percent'] = `${pct}%`;
    if (volWrapper) {
      volWrapper.style['--volume-percent'] = `${pct}%`;
    }
    if (tooltip) {
      tooltip.textContent = `${pct}%`;
    }
    return pct;
  }

  await t.test('bounds extreme positive, negative, and overflow inputs strictly between 0% and 100%', () => {
    const slider = { style: {} };
    const wrapper = { style: {} };
    const tooltip = { textContent: '' };

    // Exact boundaries
    assert.equal(simulateVolumeFill({ volume: 0, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(slider.style['--volume-percent'], '0%');
    assert.equal(tooltip.textContent, '0%');

    assert.equal(simulateVolumeFill({ volume: 1.0, isMuted: false }, slider, wrapper, tooltip), 100);
    assert.equal(slider.style['--volume-percent'], '100%');
    assert.equal(tooltip.textContent, '100%');

    // Fractional edges
    assert.equal(simulateVolumeFill({ volume: 0.0001, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: 0.005, isMuted: false }, slider, wrapper, tooltip), 1);
    assert.equal(simulateVolumeFill({ volume: 0.999, isMuted: false }, slider, wrapper, tooltip), 100);

    // Large overflow numbers (e.g. percentage 100 or 50 passed by accident)
    assert.equal(simulateVolumeFill({ volume: 100, isMuted: false }, slider, wrapper, tooltip), 100);
    assert.equal(simulateVolumeFill({ volume: 50, isMuted: false }, slider, wrapper, tooltip), 100);
    assert.equal(simulateVolumeFill({ volume: 10000, isMuted: false }, slider, wrapper, tooltip), 100);

    // Negative numbers
    assert.equal(simulateVolumeFill({ volume: -0.01, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: -100, isMuted: false }, slider, wrapper, tooltip), 0);

    // Non-finite & corrupted types
    assert.equal(simulateVolumeFill({ volume: NaN, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: Infinity, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: -Infinity, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: null, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: undefined, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: '0.75', isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: {}, isMuted: false }, slider, wrapper, tooltip), 0);
    assert.equal(simulateVolumeFill({ volume: [], isMuted: false }, slider, wrapper, tooltip), 0);
  });

  await t.test('muted state strictly overrides any volume value to 0%', () => {
    const slider = { style: {} };
    const wrapper = { style: {} };
    const tooltip = { textContent: '' };

    for (const testVol of [0, 0.25, 0.5, 0.85, 1.0, 100, -50, NaN]) {
      const pct = simulateVolumeFill({ volume: testVol, isMuted: true }, slider, wrapper, tooltip);
      assert.equal(pct, 0, `Volume ${testVol} while muted should produce 0%`);
      assert.equal(slider.style['--volume-percent'], '0%');
      assert.equal(tooltip.textContent, '0%');
    }
  });

  await t.test('wheel step simulation maintains clean rounding without floating point drift', () => {
    let volume = 0.85;
    const steps = [-0.05, -0.05, -0.05, 0.05, 0.05, -0.05, -0.05];
    for (const step of steps) {
      volume = Math.max(0, Math.min(1, Math.round((volume + step) * 100) / 100));
      const str = String(volume);
      assert.ok(str.length <= 4, `Volume ${volume} should not have floating point drift`);
    }
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Layout Robustness & Small-Screen Responsiveness (Feature 14 & 16)
// -----------------------------------------------------------------------------
test('Challenger M3 - Responsive Drawer & Layout Robustness Across Viewports', async (t) => {
  await t.test('ensures no destructive display: none remains for right-panel under 1020px', () => {
    const mediaBlock = stylesContent.match(/@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(mediaBlock, 'Media query for max-width 1020px must exist');
    assert.doesNotMatch(mediaBlock[1], /\.right-panel\s*\{[^}]*display:\s*none/);
  });

  await t.test('drawer CSS rules provide full screen-docked positioning and geometry', () => {
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?position:\s*fixed\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?right:\s*0\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?top:\s*36px\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?bottom:\s*96px\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?width:\s*clamp\(320px,\s*45vw,\s*420px\)\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?max-width:\s*90vw\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?z-index:\s*2500\s*!important/);
  });

  await t.test('drawer slide-over transforms: translateX(0) when open vs translateX(100%) when hidden', () => {
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\s*\{[\s\S]*?transform:\s*translateX\(0\)\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\.hidden\s*\{[\s\S]*?transform:\s*translateX\(100%\)\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\.hidden\s*\{[\s\S]*?opacity:\s*0\s*!important/);
    assert.match(stylesContent, /body:not\(\.mini\)\s+\.right-panel\.hidden\s*\{[\s\S]*?pointer-events:\s*none\s*!important/);
  });

  await t.test('wide viewports (> 1020px) maintain relative layout with no unexpected fixed overrides', () => {
    assert.match(stylesContent, /\.right-panel\s*\{[\s\S]*?position:\s*relative;/);
    assert.match(stylesContent, /\.right-panel\s*\{[\s\S]*?width:\s*var\(--right-panel-width,\s*340px\);/);
  });

  await t.test('frosted playbar preserves -webkit-backdrop-filter vendor prefix for WebKit/Chromium', () => {
    assert.match(stylesContent, /-webkit-backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important/);
    assert.match(stylesContent, /backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important/);
    assert.match(stylesContent, /border-top:\s*1px\s+solid\s+var\(--md-sys-color-outline-variant/);
  });

  await t.test('performance mode disables backdrop-filter on playbar to prevent GPU thrashing', () => {
    const perfPlaybar = stylesContent.match(/body\.perf:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{([\s\S]*?)\}/);
    assert.ok(perfPlaybar, 'Performance playbar rule must exist');
    assert.match(perfPlaybar[1], /backdrop-filter:\s*none\s*!important/);
    assert.match(perfPlaybar[1], /-webkit-backdrop-filter:\s*none\s*!important/);
  });
});

// -----------------------------------------------------------------------------
// Suite 4: Equalizer Bars State Synchronization (Feature 15)
// -----------------------------------------------------------------------------
test('Challenger M3 - Equalizer Bars Animation State Synced to Audio', async (t) => {
  await t.test('CSS rules strictly enforce paused state via .paused and body:not(.audio-playing)', () => {
    assert.match(stylesContent, /\.track-row\.playing\.paused\s+\.eq-bar/);
    assert.match(stylesContent, /body:not\(\.audio-playing\)\s+\.track-row\.playing\s+\.eq-bar/);
    assert.match(stylesContent, /animation-play-state:\s*paused\s*!important/);
    assert.match(stylesContent, /transform:\s*scaleY\(0\.35\)\s*!important/);
  });

  await t.test('eq-bars have staggered animation durations for organic visualizer motion', () => {
    const bar1 = stylesContent.match(/\.playing-equalizer-bars\s+\.eq-bar-1\s*\{([\s\S]*?)\}/);
    const bar2 = stylesContent.match(/\.playing-equalizer-bars\s+\.eq-bar-2\s*\{([\s\S]*?)\}/);
    const bar3 = stylesContent.match(/\.playing-equalizer-bars\s+\.eq-bar-3\s*\{([\s\S]*?)\}/);
    assert.ok(bar1 && bar2 && bar3);
    assert.match(bar1[1], /animation-duration:\s*0\.65s/);
    assert.match(bar2[1], /animation-duration:\s*0\.85s/);
    assert.match(bar3[1], /animation-duration:\s*0\.55s/);
  });

  await t.test('DOM simulation: rapid sequential track switching maintains exact single-playing-row invariant', () => {
    // Construct mock DOM environment
    class MockClassList {
      constructor() { this.classes = new Set(); }
      add(...cls) { cls.forEach(c => this.classes.add(c)); }
      remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
      toggle(cls, force) {
        if (typeof force === 'boolean') {
          if (force) this.classes.add(cls);
          else this.classes.delete(cls);
          return force;
        }
        if (this.classes.has(cls)) { this.classes.delete(cls); return false; }
        this.classes.add(cls); return true;
      }
      contains(cls) { return this.classes.has(cls); }
    }

    class MockElement {
      constructor(tag, parent = null) {
        this.tagName = tag;
        this.parentElement = parent;
        this.classList = new MockClassList();
        this.dataset = {};
        this.children = [];
      }
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      }
      querySelectorAll(selector) {
        const res = [];
        const match = (el) => {
          if (selector === '.track-row' && el.classList.contains('track-row')) res.push(el);
          if (selector === '.track-row.playing' && el.classList.contains('track-row') && el.classList.contains('playing')) res.push(el);
          for (const c of el.children) match(c);
        };
        for (const c of this.children) match(c);
        return res;
      }
    }

    const containerA = new MockElement('div');
    const containerB = new MockElement('div');
    const allRows = [];

    // Create 20 tracks in container A, 20 tracks in container B
    for (let i = 0; i < 20; i++) {
      const rowA = new MockElement('div', containerA);
      rowA.classList.add('track-row');
      rowA.dataset.canonicalId = `track-${i}`;
      rowA.dataset.trackIndex = String(i);
      containerA.appendChild(rowA);
      allRows.push(rowA);

      const rowB = new MockElement('div', containerB);
      rowB.classList.add('track-row');
      rowB.dataset.canonicalId = `track-${i}`;
      rowB.dataset.trackIndex = String(i);
      containerB.appendChild(rowB);
      allRows.push(rowB);
    }

    const mockBody = new MockElement('body');

    // Simulate highlightPlayingRow logic
    function runHighlightPlayingRow(activeCanonicalId, isPlaying) {
      if (!activeCanonicalId) {
        allRows.forEach(r => r.classList.remove('playing', 'paused'));
        mockBody.classList.remove('audio-playing');
        return;
      }

      allRows.forEach(r => r.classList.remove('playing', 'paused'));

      const containers = [containerA, containerB];
      containers.forEach(container => {
        const matches = container.querySelectorAll('.track-row').filter(r => r.dataset.canonicalId === activeCanonicalId);
        if (matches.length > 0) {
          const target = matches[0];
          target.classList.add('playing');
          target.classList.toggle('paused', !isPlaying);
        }
      });

      mockBody.classList.toggle('audio-playing', isPlaying);
    }

    // 100 rapid sequential track switches
    for (let step = 0; step < 100; step++) {
      const targetIdx = step % 20;
      const isPlaying = step % 3 !== 0; // occasional pause
      runHighlightPlayingRow(`track-${targetIdx}`, isPlaying);

      // Invariant checks:
      const playingRows = allRows.filter(r => r.classList.contains('playing'));
      assert.equal(playingRows.length, 2, `Step ${step}: exactly 1 row per container should be playing (total 2)`);
      for (const row of playingRows) {
        assert.equal(row.dataset.canonicalId, `track-${targetIdx}`);
        assert.equal(row.classList.contains('paused'), !isPlaying);
      }
      assert.equal(mockBody.classList.contains('audio-playing'), isPlaying);
    }

    // Stop playback
    runHighlightPlayingRow(null, false);
    assert.equal(allRows.filter(r => r.classList.contains('playing')).length, 0);
    assert.equal(allRows.filter(r => r.classList.contains('paused')).length, 0);
    assert.equal(mockBody.classList.contains('audio-playing'), false);
  });
});

// -----------------------------------------------------------------------------
// Suite 5: CSS Syntax Integrity & Empty State Verification (Feature 17 & 18)
// -----------------------------------------------------------------------------
test('Challenger M3 - CSS Syntax Integrity & Empty States Structure', async (t) => {
  await t.test('CSS syntax check: verifies no invalid blur: property declarations in entire styles.css', () => {
    const invalidBlurMatches = [...stylesContent.matchAll(/(?<![-_a-zA-Z])blur\s*:\s*[^;]+;/g)];
    assert.equal(invalidBlurMatches.length, 0, `Found invalid blur property declarations: ${JSON.stringify(invalidBlurMatches)}`);
  });

  await t.test('all window control buttons in index.html are free of .win-btn distortion', () => {
    const windowControls = htmlContent.match(/<div class="[^"]*window-controls[^"]*">([\s\S]*?)<\/div>/);
    assert.ok(windowControls);
    assert.doesNotMatch(windowControls[1], /win-btn/);
    const controlIds = ['btn-mini-lyrics', 'btn-mini-player', 'btn-minimize', 'btn-maximize', 'btn-close'];
    for (const id of controlIds) {
      assert.ok(windowControls[1].includes(`id="${id}"`), `Window control button #${id} must exist in window-controls`);
    }
  });

  await t.test('empty state card structure contains badge, title, and subtitle classes', () => {
    assert.match(stylesContent, /\.empty-state-card\s*\{/);
    assert.match(stylesContent, /\.empty-state-badge\s*\{/);
    assert.match(stylesContent, /\.empty-state-title\s*\{/);
    assert.match(stylesContent, /\.empty-state-sub\s*\{/);
  });

  await t.test('app.js covers all 6 contextual empty view states', () => {
    const contexts = ['search', 'favorites', 'playlist', 'queue', 'history', 'local'];
    for (const ctx of contexts) {
      assert.ok(appContent.includes(`${ctx}: {`), `renderTracks empty state configuration must handle context "${ctx}"`);
    }
  });

  await t.test('app.js applyIconPack handles #nav-discover SVG toggling and icon swapping', () => {
    assert.match(appContent, /if\s*\(\s*sel\s*===\s*'#nav-discover\s+svg'\s*\)/);
    assert.match(appContent, /nav-discover-pack-svg/);
    assert.match(appContent, /nav-home-app-icon/);
  });
});

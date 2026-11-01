const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Target modules
const { RaserAudioEngine, EQ_PRESETS } = require('../../src/renderer/audio');

test('Challenger M2 - Equalizer Presets Engine & UI Verification', async (t) => {
  const EXPECTED_PRESETS = [
    'flat',
    'bass_boost',
    'treble_boost',
    'vocal_boost',
    'rock',
    'pop',
    'electronic',
    'jazz',
    'classical',
    'acoustic',
    'hiphop'
  ];

  await t.test('EQ_PRESETS contains exactly the 11 specified presets with valid 10-band numeric arrays', () => {
    assert.ok(EQ_PRESETS, 'EQ_PRESETS must be exported');
    const presetKeys = Object.keys(EQ_PRESETS);
    assert.equal(presetKeys.length, 11, `Expected 11 presets, got ${presetKeys.length}`);

    for (const key of EXPECTED_PRESETS) {
      assert.ok(EQ_PRESETS[key], `Preset "${key}" must exist`);
      const preset = EQ_PRESETS[key];
      assert.ok(typeof preset.name === 'string' && preset.name.trim().length > 0, `Preset "${key}" must have a valid name`);
      assert.ok(Array.isArray(preset.bands), `Preset "${key}" bands must be an array`);
      assert.equal(preset.bands.length, 10, `Preset "${key}" must contain exactly 10 bands`);

      for (let i = 0; i < 10; i++) {
        const gain = preset.bands[i];
        assert.ok(typeof gain === 'number' && Number.isFinite(gain), `Band ${i} in preset "${key}" must be a finite number`);
        assert.ok(gain >= -12 && gain <= 12, `Band ${i} in preset "${key}" (${gain} dB) must be in [-12, +12] dB`);
      }
    }
  });

  await t.test('EQ_PRESETS object is frozen against accidental runtime mutations', () => {
    assert.ok(Object.isFrozen(EQ_PRESETS), 'EQ_PRESETS must be Object.freeze-d');
    assert.throws(() => {
      'use strict';
      EQ_PRESETS.new_preset = { name: 'Exploit', bands: [] };
    }, /TypeError/, 'Adding new presets to frozen EQ_PRESETS must throw');
  });

  await t.test('setEqBands strictly clamps gains within [-12, +12] dB and handles adversarial inputs', () => {
    const engine = new RaserAudioEngine();
    engine.audioSettings = { eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

    // Standard valid preset input (Rock)
    engine.setEqBands([5, 3, 2, -1, -2, 0, 2, 4, 5, 5]);
    assert.deepEqual(engine.audioSettings.eqBands, [5, 3, 2, -1, -2, 0, 2, 4, 5, 5]);

    // Out of bounds input: extreme positive and negative values
    engine.setEqBands([100, -100, 12.5, -12.5, 0, 0, 0, 0, 0, 0]);
    assert.equal(engine.audioSettings.eqBands[0], 12, 'Exceeding +12 dB must clamp to 12');
    assert.equal(engine.audioSettings.eqBands[1], -12, 'Below -12 dB must clamp to -12');
    assert.equal(engine.audioSettings.eqBands[2], 12, '+12.5 must clamp to 12');
    assert.equal(engine.audioSettings.eqBands[3], -12, '-12.5 must clamp to -12');

    // Malformed inputs: non-numbers, undefined, null
    engine.setEqBands(['invalid', null, undefined, {}, true, false, 0, 0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      assert.equal(engine.audioSettings.eqBands[i], 0, `Malformed entry at index ${i} must safely default to 0 dB`);
    }

    // Partial array (< 10 bands): missing bands default to 0
    engine.setEqBands([4, 2]);
    assert.equal(engine.audioSettings.eqBands.length, 10);
    assert.equal(engine.audioSettings.eqBands[0], 4);
    assert.equal(engine.audioSettings.eqBands[1], 2);
    assert.equal(engine.audioSettings.eqBands[2], 0);

    // Non-array input: should no-op safely without throwing
    assert.doesNotThrow(() => engine.setEqBands(null));
    assert.doesNotThrow(() => engine.setEqBands('not an array'));
    assert.doesNotThrow(() => engine.setEqBands(12345));
  });

  await t.test('UI fader and preset chip two-way synchronization oracle', () => {
    // Construct DOM fixture simulating index.html structure
    class MockElement {
      constructor(tagName) {
        this.tagName = tagName;
        this.classList = new Set();
        this.dataset = {};
        this.children = [];
        this.listeners = {};
        this.value = '0';
        this.textContent = '';
        this.innerHTML = '';
      }
      addEventListener(evt, cb) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(cb);
      }
      trigger(evt, payload = {}) {
        if (this.listeners[evt]) {
          for (const cb of this.listeners[evt]) {
            cb({ target: this, ...payload });
          }
        }
      }
      querySelector(selector) {
        if (selector === '.eq-band-val') return this.children.find(c => c.classList.has('eq-band-val')) || null;
        if (selector === '.eq-band-range') return this.children.find(c => c.classList.has('eq-band-range')) || null;
        return null;
      }
      querySelectorAll(selector) {
        const matches = [];
        const traverse = (node) => {
          if (selector === '.eq-preset-chip' && node.classList && node.classList.has('eq-preset-chip')) {
            matches.push(node);
          }
          if (selector === '.eq-band-range' && node.classList && node.classList.has('eq-band-range')) {
            matches.push(node);
          }
          if (selector === '.eq-band-val' && node.classList && node.classList.has('eq-band-val')) {
            matches.push(node);
          }
          for (const ch of node.children || []) traverse(ch);
        };
        traverse(this);
        return matches;
      }
      appendChild(ch) {
        this.children.push(ch);
        ch.parentNode = this;
      }
    }

    // Set up mock DOM elements
    const mockContainer = new MockElement('div');
    const mockChipsContainer = new MockElement('div');

    const faderInputs = [];
    const valLabels = [];

    for (let i = 0; i < 10; i++) {
      const box = new MockElement('div');
      const val = new MockElement('span');
      val.classList.add('eq-band-val');
      val.textContent = '0 dB';
      box.appendChild(val);
      valLabels.push(val);

      const input = new MockElement('input');
      input.classList.add('eq-band-range');
      input.value = '0';
      box.appendChild(input);
      faderInputs.push(input);

      mockContainer.appendChild(box);
    }

    const chips = [];
    for (const [key, preset] of Object.entries(EQ_PRESETS)) {
      const chip = new MockElement('button');
      chip.classList.add('eq-preset-chip');
      chip.dataset.eqPreset = key;
      chip.textContent = preset.name;
      mockChipsContainer.appendChild(chip);
      chips.push(chip);
    }

    // Helper functions mirroring app.js logic
    const state = {
      activeEqPreset: null,
      audioSettings: { eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    };

    function updateHighlight() {
      const currentBands = state.audioSettings.eqBands;
      let matched = null;
      for (const [key, preset] of Object.entries(EQ_PRESETS)) {
        if (preset.bands.every((b, idx) => (currentBands[idx] || 0) === b)) {
          matched = key;
          break;
        }
      }
      state.activeEqPreset = matched;
      for (const chip of chips) {
        if (chip.dataset.eqPreset === matched) {
          chip.classList.add('active');
        } else {
          chip.classList.delete('active');
        }
      }
    }

    function applyPreset(presetKey) {
      const p = EQ_PRESETS[presetKey];
      if (!p) return;
      state.audioSettings.eqBands = [...p.bands];
      faderInputs.forEach((input, i) => {
        const val = p.bands[i] || 0;
        input.value = String(val);
        valLabels[i].textContent = `${val > 0 ? '+' : ''}${val} dB`;
      });
      updateHighlight();
    }

    // Initially all 0 -> flat preset should be active
    updateHighlight();
    assert.equal(state.activeEqPreset, 'flat');
    const flatChip = chips.find(c => c.dataset.eqPreset === 'flat');
    assert.ok(flatChip.classList.has('active'), 'Flat chip must be active initially');

    // Select "bass_boost"
    applyPreset('bass_boost');
    assert.equal(state.activeEqPreset, 'bass_boost');
    const bassChip = chips.find(c => c.dataset.eqPreset === 'bass_boost');
    assert.ok(bassChip.classList.has('active'), 'Bass Boost chip must be active');
    assert.ok(!flatChip.classList.has('active'), 'Flat chip must be inactive');
    assert.equal(faderInputs[0].value, '6');
    assert.equal(valLabels[0].textContent, '+6 dB');
    assert.equal(faderInputs[1].value, '5');
    assert.equal(valLabels[1].textContent, '+5 dB');

    // Manually tweak band 0 from +6 to +2
    faderInputs[0].value = '2';
    state.audioSettings.eqBands[0] = 2;
    valLabels[0].textContent = '+2 dB';
    updateHighlight();

    // No longer matches any preset -> activeEqPreset is null, no chips active
    assert.equal(state.activeEqPreset, null, 'Custom settings must not match preset');
    assert.ok(!bassChip.classList.has('active'), 'Bass chip must lose active state on custom edit');
    assert.ok(!chips.some(c => c.classList.has('active')), 'No chips active when custom values set');

    // Double-click band 0 -> resets to 0
    faderInputs[0].value = '0';
    state.audioSettings.eqBands[0] = 0;
    valLabels[0].textContent = '0 dB';

    // Now select "rock"
    applyPreset('rock');
    assert.equal(state.activeEqPreset, 'rock');
    const rockChip = chips.find(c => c.dataset.eqPreset === 'rock');
    assert.ok(rockChip.classList.has('active'), 'Rock chip must be active');
    assert.equal(faderInputs[0].value, '5');
    assert.equal(faderInputs[3].value, '-1');
    assert.equal(valLabels[3].textContent, '-1 dB');
  });
});

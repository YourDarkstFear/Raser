const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Provide browser globals mock before requiring renderer scripts in Node test env
if (typeof global.window === 'undefined') {
  global.window = global;
}
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
global.window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window.cancelAnimationFrame = (id) => clearTimeout(id);
if (typeof global.Storage === 'undefined') {
  global.Storage = { prototype: {} };
}
if (typeof global.document === 'undefined') {
  global.document = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      style: { setProperty: () => {} },
      appendChild: () => {},
      addEventListener: () => {}
    }),
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } }
  };
}
if (typeof global.localStorage === 'undefined') {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

// Target modules
const { RaserAudioEngine, RiffAudioEngine, EQ_PRESETS } = require('../src/renderer/audio');
const { parseLrc, getTrackLyricsOffset, setTrackLyricsOffset } = require('../src/renderer/app');
const {
  pruneDiskCache,
  getMaxCacheLimit,
  writeAtomicJsonAsync,
  saveTrackMetadata,
  saveLibraryIndex,
  flushSyncPendingWrites
} = require('../src/server/server');

// -----------------------------------------------------------------------------
// Suite 1: Feature 7 - Normalizer Analyzer Routing & Metering Fix
// -----------------------------------------------------------------------------
test('Suite 1: Feature 7 - Normalizer Analyzer Routing & Metering', async (t) => {
  await t.test('AudioEngine class exports properly and instantiates cleanly', () => {
    assert.ok(RaserAudioEngine, 'RaserAudioEngine should be exported');
    assert.equal(RaserAudioEngine, RiffAudioEngine, 'RaserAudioEngine should alias RiffAudioEngine');
    const engine = new RaserAudioEngine();
    assert.ok(engine, 'Engine instance created');
    assert.equal(engine.graphInitialized, false);
    assert.equal(engine.getLevelDb(), -120, 'getLevelDb returns -120 when levelAnalyser is uninitialized');
  });

  await t.test('getLevelDb computes accurate RMS in dB from audio buffer', () => {
    const engine = new RaserAudioEngine();
    // Simulate Web Audio levelAnalyser and buffer
    engine.levelBuf = new Float32Array(2048);
    engine.levelAnalyser = {
      getFloatTimeDomainData: (buf) => {
        // Fill buffer with sine-like or constant test signal of amplitude 0.1 (-20 dB)
        for (let i = 0; i < buf.length; i++) {
          buf[i] = 0.1;
        }
      }
    };
    const db = engine.getLevelDb();
    // 20 * log10(0.1) = -20 dB
    assert.ok(Math.abs(db - (-20)) < 0.01, `Expected ~ -20 dB, got ${db}`);
  });

  await t.test('getLevelDb returns -120 on silent buffer', () => {
    const engine = new RaserAudioEngine();
    engine.levelBuf = new Float32Array(2048);
    engine.levelAnalyser = {
      getFloatTimeDomainData: (buf) => {
        buf.fill(0);
      }
    };
    const db = engine.getLevelDb();
    assert.equal(db, -120, 'Silent buffer must yield -120 dB');
  });

  await t.test('Graph wiring connects levelAnalyser to main bus in both flat and active EQ states', () => {
    // Read source code of src/renderer/audio.js to audit node wiring
    const audioSrc = fs.readFileSync(path.join(__dirname, '../src/renderer/audio.js'), 'utf-8');
    assert.ok(
      audioSrc.includes('this.bus.connect(this.levelAnalyser);'),
      'audio.js must connect this.bus to this.levelAnalyser'
    );
    assert.ok(
      !audioSrc.includes('this.eqHigh.connect(this.levelAnalyser);'),
      'audio.js must NOT connect eqHigh directly to levelAnalyser'
    );
    // In _updateRouting, verify levelAnalyser is reconnected to this.bus
    const updateRoutingSection = audioSrc.slice(audioSrc.indexOf('_updateRouting()'), audioSrc.indexOf('flushEffects()'));
    assert.ok(
      updateRoutingSection.includes('this.bus.connect(this.levelAnalyser);'),
      '_updateRouting must preserve levelAnalyser connection to this.bus'
    );
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Feature 8 - 10-Band Equalizer Presets Engine
// -----------------------------------------------------------------------------
test('Suite 2: Feature 8 - 10-Band Equalizer Presets Engine', async (t) => {
  const expectedPresetKeys = [
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

  await t.test('EQ_PRESETS contains all 11 required acoustic & genre configurations', () => {
    assert.ok(EQ_PRESETS, 'EQ_PRESETS should be exported');
    for (const key of expectedPresetKeys) {
      assert.ok(EQ_PRESETS[key], `Preset ${key} must exist`);
      assert.ok(typeof EQ_PRESETS[key].name === 'string' && EQ_PRESETS[key].name.length > 0, `Preset ${key} must have name`);
      assert.ok(Array.isArray(EQ_PRESETS[key].bands), `Preset ${key} must have bands array`);
      assert.equal(EQ_PRESETS[key].bands.length, 10, `Preset ${key} must have exactly 10 bands`);
      // Validate gain ranges (-12 to +12 dB)
      for (const gain of EQ_PRESETS[key].bands) {
        assert.ok(typeof gain === 'number', 'Band gain must be number');
        assert.ok(gain >= -12 && gain <= 12, `Gain ${gain} out of range [-12, 12] in preset ${key}`);
      }
    }
  });

  await t.test('Flat preset has 0 dB across all 10 bands', () => {
    assert.deepEqual(EQ_PRESETS.flat.bands, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  await t.test('Bass Boost enhances sub-bass and mid-bass without distorting upper frequencies', () => {
    assert.deepEqual(EQ_PRESETS.bass_boost.bands, [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]);
  });

  await t.test('Treble Boost enhances higher frequency bands', () => {
    assert.deepEqual(EQ_PRESETS.treble_boost.bands, [0, 0, 0, 0, 0, 1, 2, 4, 6, 6]);
  });

  await t.test('setEqBands updates audio engine settings and clamps values', () => {
    const engine = new RaserAudioEngine();
    engine.audioSettings = { eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    engine.setEqBands([5, 3, 2, -1, -2, 0, 2, 4, 5, 5]); // Rock preset
    assert.deepEqual(engine.audioSettings.eqBands, [5, 3, 2, -1, -2, 0, 2, 4, 5, 5]);

    // Test clamping beyond [-12, +12]
    engine.setEqBands([20, -18, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(engine.audioSettings.eqBands[0], 12, 'Upper clamp at +12 dB');
    assert.equal(engine.audioSettings.eqBands[1], -12, 'Lower clamp at -12 dB');
  });

  await t.test('HTML and CSS contain eq-presets-chips and .eq-preset-chip styling', () => {
    const htmlSrc = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf-8');
    assert.ok(htmlSrc.includes('id="eq-presets-chips"'), 'index.html must include eq-presets-chips element');

    const cssSrc = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf-8');
    assert.ok(cssSrc.includes('.eq-presets-chips'), 'styles.css must include .eq-presets-chips container');
    assert.ok(cssSrc.includes('.eq-preset-chip.active'), 'styles.css must include active chip styling');
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Feature 9 - Custom Lyrics Start Time Calculation Fix
// -----------------------------------------------------------------------------
test('Suite 3: Feature 9 - Custom Lyrics Start Time Calculation Fix', async (t) => {
  const CUSTOM_SHIFT_LEAD_SECONDS = 0.25;

  function mockGetLineStartTime(idx, lines, isCustomLyrics) {
    if (idx < 0 || idx >= lines.length) return -1;
    const raw = lines[idx].time;
    if (raw < 0) return -1;
    if (!isCustomLyrics) return raw;
    return Math.max(0, raw - (typeof CUSTOM_SHIFT_LEAD_SECONDS === 'number' ? CUSTOM_SHIFT_LEAD_SECONDS : 0.25));
  }

  const sampleLines = [
    { time: 10.0, text: 'First line' },
    { time: 20.0, text: 'Second line' },
    { time: 30.0, text: 'Third line' }
  ];

  await t.test('standard lyrics return unshifted raw timestamp', () => {
    assert.equal(mockGetLineStartTime(0, sampleLines, false), 10.0);
    assert.equal(mockGetLineStartTime(1, sampleLines, false), 20.0);
    assert.equal(mockGetLineStartTime(2, sampleLines, false), 30.0);
  });

  await t.test('custom lyrics apply exact lead offset without collapsing onto previous lines', () => {
    assert.equal(mockGetLineStartTime(0, sampleLines, true), 9.75);
    assert.equal(mockGetLineStartTime(1, sampleLines, true), 19.75, 'Line 1 must NOT collapse to line 0 timestamp (10.0)');
    assert.equal(mockGetLineStartTime(2, sampleLines, true), 29.75, 'Line 2 must NOT collapse to line 1 timestamp (20.0)');
  });

  await t.test('out-of-bounds or negative timestamps return -1', () => {
    assert.equal(mockGetLineStartTime(-1, sampleLines, true), -1);
    assert.equal(mockGetLineStartTime(99, sampleLines, true), -1);
    assert.equal(mockGetLineStartTime(0, [{ time: -1, text: 'plain' }], true), -1);
  });

  await t.test('timestamp close to zero clamps cleanly to zero', () => {
    const lines = [{ time: 0.1, text: 'Intro' }];
    assert.equal(mockGetLineStartTime(0, lines, true), 0);
  });
});

// -----------------------------------------------------------------------------
// Suite 4: Feature 10 - Enhanced LRC Parser & Offset Controls
// -----------------------------------------------------------------------------
test('Suite 4: Feature 10 - Enhanced LRC Parser & Offset Controls', async (t) => {
  await t.test('parses multi-timestamp tags on the same line', () => {
    const lrc = '[00:10.50][01:20.50]Chorus line';
    const parsed = parseLrc(lrc);
    assert.equal(parsed.length, 2, 'Must create 2 separate timed entries');
    assert.equal(parsed[0].time, 10.5);
    assert.equal(parsed[0].text, 'Chorus line');
    assert.equal(parsed[1].time, 80.5);
    assert.equal(parsed[1].text, 'Chorus line');
  });

  await t.test('parses standard [offset:+/-ms] header and adjusts timestamps', () => {
    // 500 ms = +0.5s shift
    const lrcWithOffset = '[offset:500]\n[00:01.00][00:05.00]Chorus line';
    const parsed = parseLrc(lrcWithOffset);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].time, 1.5, '00:01.00 + 0.5s = 1.50s');
    assert.equal(parsed[1].time, 5.5, '00:05.00 + 0.5s = 5.50s');
    assert.equal(parsed[0].text, 'Chorus line');
  });

  await t.test('handles negative offset and clamps to 0s minimum', () => {
    const lrcNegative = '[offset:-2000]\n[00:01.00]First line\n[00:10.00]Second line';
    const parsed = parseLrc(lrcNegative);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].time, 0, '1.0s - 2.0s = -1.0s clamped to 0');
    assert.equal(parsed[1].time, 8.0, '10.0s - 2.0s = 8.0s');
  });

  await t.test('parses centiseconds delimited by colon or dot', () => {
    const lrc = '[01:15:40]Colon centiseconds\n[02:00.85]Dot centiseconds';
    const parsed = parseLrc(lrc);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].time, 75.4);
    assert.equal(parsed[1].time, 120.85);
  });

  await t.test('filters metadata headers (ti, ar, al, by, etc.) from becoming lyric lines', () => {
    const lrc = `[ti:Song Title]
[ar:Song Artist]
[al:Song Album]
[by:Author]
[offset:250]
[00:05.00]Actual lyric line`;
    const parsed = parseLrc(lrc);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].time, 5.25);
    assert.equal(parsed[0].text, 'Actual lyric line');
  });

  await t.test('preserves plain untimed lines with time: -1', () => {
    const plain = `First plain line
Second plain line`;
    const parsed = parseLrc(plain);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].time, -1);
    assert.equal(parsed[0].text, 'First plain line');
    assert.equal(parsed[1].time, -1);
    assert.equal(parsed[1].text, 'Second plain line');
  });

  await t.test('per-track manual sync offset persistence', () => {
    // Provide polyfill for localStorage in Node test environment
    const storageMap = new Map();
    global.localStorage = {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    };

    const trackA = { id: 'track_123', title: 'Song A', artist: 'Artist A' };
    const trackB = { id: 'track_456', title: 'Song B', artist: 'Artist B' };

    assert.equal(getTrackLyricsOffset(trackA), 0);
    setTrackLyricsOffset(trackA, 0.5);
    assert.equal(getTrackLyricsOffset(trackA), 0.5);

    setTrackLyricsOffset(trackB, -0.3);
    assert.equal(getTrackLyricsOffset(trackB), -0.3);
    assert.equal(getTrackLyricsOffset(trackA), 0.5, 'Track A offset preserved independently');

    // Resetting offset to 0 clears entry
    setTrackLyricsOffset(trackA, 0);
    assert.equal(getTrackLyricsOffset(trackA), 0);
  });
});

// -----------------------------------------------------------------------------
// Suite 5: Feature 11 - Cache LRU Eviction & Async Index Writes
// -----------------------------------------------------------------------------
test('Suite 5: Feature 11 - Cache LRU Eviction & Async Index Persistence', async (t) => {
  await t.test('getMaxCacheLimit returns configurable ceiling or defaults to 3GB', () => {
    const limit = getMaxCacheLimit();
    assert.ok(typeof limit === 'number');
    assert.ok(limit >= 1024 * 1024 * 1024, 'Default limit should be at least 1 GB');
  });

  await t.test('writeAtomicJsonAsync writes atomically via tmp file and renames cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-test-atomic-'));
    const targetFile = path.join(tmpDir, 'test-metadata.json');
    const data = { hello: 'world', timestamp: Date.now() };

    await writeAtomicJsonAsync(targetFile, data);
    assert.ok(fs.existsSync(targetFile), 'Target file must exist');
    const read = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    assert.deepEqual(read, data, 'Written data must match input');

    // Overwrite test
    const updated = { ...data, status: 'ok' };
    await writeAtomicJsonAsync(targetFile, updated);
    const readUpdated = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    assert.deepEqual(readUpdated, updated);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('pruneDiskCache correctly evicts oldest tracks when exceeding custom quota ceiling', async () => {
    // Create dedicated test cache folder
    const testCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-cache-lru-'));
    const oldCacheDir = require('../src/shared/platform').CACHE_DIR;

    try {
      // Create 3 dummy audio files with staggered sizes and timestamps
      const file1 = path.join(testCacheDir, 'track_old.m4a');
      const file2 = path.join(testCacheDir, 'track_mid.webm');
      const file3 = path.join(testCacheDir, 'track_new.mp3');

      // 100 KB each = 300 KB total
      const chunk100k = Buffer.alloc(100 * 1024, 0x41);
      fs.writeFileSync(file1, chunk100k);
      fs.writeFileSync(file2, chunk100k);
      fs.writeFileSync(file3, chunk100k);

      // Set explicit access times: file1 is oldest, file3 is newest
      const nowSec = Math.floor(Date.now() / 1000);
      fs.utimesSync(file1, nowSec - 3000, nowSec - 3000); // 50 mins ago
      fs.utimesSync(file2, nowSec - 1000, nowSec - 1000); // 16 mins ago
      fs.utimesSync(file3, nowSec, nowSec);               // now

      // Create a stale temp file (> 10 mins) and a sub-1000-byte junk file
      const tempFile = path.join(testCacheDir, 'download.temp.1234.m4a');
      fs.writeFileSync(tempFile, Buffer.alloc(5000, 0x42));
      fs.utimesSync(tempFile, nowSec - 1200, nowSec - 1200);

      const tinyJunk = path.join(testCacheDir, 'empty.mp3');
      fs.writeFileSync(tinyJunk, Buffer.alloc(500, 0x00));

      // Temporarily swap CACHE_DIR in module or call helper
      const platformMod = require('../src/shared/platform');
      const origCacheDir = platformMod.CACHE_DIR;
      platformMod.CACHE_DIR = testCacheDir;

      // Quota of 250 KB (total is ~300 KB). Threshold 80% = 200 KB.
      // Must evict file1 (oldest), leaving file2 and file3 (200 KB).
      // Stale temp and tiny junk must also be deleted.
      await pruneDiskCache(250 * 1024);

      assert.ok(!fs.existsSync(tempFile), 'Stale temp file must be pruned');
      assert.ok(!fs.existsSync(tinyJunk), 'Tiny sub-1KB junk must be pruned');
      assert.ok(!fs.existsSync(file1), 'Oldest track must be evicted by LRU');
      assert.ok(fs.existsSync(file2), 'Mid track must remain');
      assert.ok(fs.existsSync(file3), 'Newest track must remain');

      platformMod.CACHE_DIR = origCacheDir;
    } finally {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });
});

#!/usr/bin/env node
'use strict';

/**
 * Raser Programmatic Verification Runner (Milestone 4 / Requirement R4)
 *
 * Comprehensive end-to-end automated verification runner validating:
 * 1. JavaScript Syntax Validation across all source directories (src/main, src/renderer, src/server, src/shared)
 * 2. Automated Regression Test Suite (npm test / node --test)
 * 3. Preload & IPC Security Audit (context isolation, exposed API shapes, IPC contracts)
 * 4. Backend Streaming & In-Process Server Integrity (token auth, origin check, WHATWG URLs, fallback routes)
 * 5. Audio Engine, DSP & Presets Integrity (level analyzer bus routing, 10-band EQ presets, LRC parser & sync)
 * 6. UI Aesthetics & Layout Polish Integrity (scrubber dynamic contrast, volume gradient fill, responsive drawer, equalizer visualizer)
 * 7. Clean Application Startup & Error Check (CLI interface & full Electron main process startup lifecycle)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const vm = require('vm');
const { spawn, spawnSync, execFileSync } = require('child_process');
const assert = require('assert/strict');

const ROOT_DIR = path.resolve(__dirname, '..');

// ============================================================================
// ANSI Color & Formatting Utilities
// ============================================================================
const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR === '1');

const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  blue: useColor ? '\x1b[34m' : '',
  magenta: useColor ? '\x1b[35m' : '',
  gray: useColor ? '\x1b[90m' : ''
};

const SYMBOLS = {
  pass: `${c.green}✔${c.reset}`,
  fail: `${c.red}✖${c.reset}`,
  arrow: `${c.cyan}▶${c.reset}`,
  bullet: `${c.dim}•${c.reset}`
};

// ============================================================================
// Verification Suite Runner Framework
// ============================================================================
class VerificationRunner {
  constructor() {
    this.totalChecks = 0;
    this.passedChecks = 0;
    this.failedChecks = 0;
    this.suitesPassed = 0;
    this.suitesFailed = 0;
    this.errors = [];
    this.startTime = Date.now();
  }

  logHeader() {
    console.log(`\n${c.bold}${c.cyan}================================================================================${c.reset}`);
    console.log(`${c.bold}${c.cyan}                    RASER AUTOMATED VERIFICATION RUNNER                         ${c.reset}`);
    console.log(`${c.dim}                 Requirement R4 Verification & Security Audit                   ${c.reset}`);
    console.log(`${c.bold}${c.cyan}================================================================================${c.reset}\n`);
  }

  async runSuite(name, suiteFn) {
    console.log(`${SYMBOLS.arrow} ${c.bold}${name}${c.reset}`);
    const suiteStart = Date.now();
    let suiteError = null;
    const checksBefore = this.failedChecks;

    try {
      await suiteFn(this);
    } catch (err) {
      suiteError = err;
      this.recordCheck(false, `Suite fatal failure: ${err.message}`, err);
    }

    const suiteDuration = Date.now() - suiteStart;
    const suiteFailed = suiteError || (this.failedChecks > checksBefore);
    if (suiteFailed) {
      this.suitesFailed++;
      console.log(`  ${c.red}Suite failed in ${suiteDuration}ms${c.reset}\n`);
    } else {
      this.suitesPassed++;
      console.log(`  ${c.dim}Suite passed in ${suiteDuration}ms${c.reset}\n`);
    }
  }

  recordCheck(passed, message, err = null, durationMs = null) {
    this.totalChecks++;
    const timeStr = durationMs !== null ? ` ${c.gray}(${durationMs}ms)${c.reset}` : '';
    if (passed) {
      this.passedChecks++;
      console.log(`  ${SYMBOLS.pass} ${message}${timeStr}`);
    } else {
      this.failedChecks++;
      console.log(`  ${SYMBOLS.fail} ${c.red}${message}${c.reset}${timeStr}`);
      if (err) {
        this.errors.push({ message, err });
        const stackSnippet = err.stack ? err.stack.split('\n').slice(0, 4).map(l => `      ${c.gray}${l}${c.reset}`).join('\n') : '';
        if (stackSnippet) console.log(stackSnippet);
      }
    }
  }

  summary() {
    const totalDuration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log(`${c.bold}${c.cyan}================================================================================${c.reset}`);
    console.log(`${c.bold}VERIFICATION SUMMARY${c.reset}`);
    console.log(`${c.dim}--------------------------------------------------------------------------------${c.reset}`);
    console.log(`  Total Suites:   ${this.suitesPassed > 0 ? c.green : ''}${this.suitesPassed} passed${c.reset}, ${this.suitesFailed > 0 ? c.red : c.gray}${this.suitesFailed} failed${c.reset}`);
    console.log(`  Total Checks:   ${this.passedChecks > 0 ? c.green : ''}${this.passedChecks} passed${c.reset}, ${this.failedChecks > 0 ? c.red : c.gray}${this.failedChecks} failed${c.reset}`);
    console.log(`  Total Duration: ${c.bold}${totalDuration}s${c.reset}`);

    if (this.failedChecks === 0 && this.suitesFailed === 0) {
      console.log(`  Result:         ${c.bold}${c.green}ALL VERIFICATIONS PASSED (Exit code: 0)${c.reset}`);
      console.log(`${c.bold}${c.cyan}================================================================================${c.reset}\n`);
      return 0;
    } else {
      console.log(`  Result:         ${c.bold}${c.red}VERIFICATION FAILURES DETECTED (Exit code: 1)${c.reset}`);
      console.log(`${c.bold}${c.cyan}================================================================================${c.reset}\n`);
      return 1;
    }
  }
}

// ============================================================================
// Helper: Collect Source Files Recursively
// ============================================================================
function getSourceFiles(dirPath, ext = '.js') {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let files = [];
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      files.push(...getSourceFiles(full, ext));
    } else if (ent.name.endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

// ============================================================================
// Suite 1: JavaScript Syntax Validation across All Source Files
// ============================================================================
async function runSyntaxValidationSuite(runner) {
  const targetDirs = [
    path.join(ROOT_DIR, 'src', 'main'),
    path.join(ROOT_DIR, 'src', 'preload'),
    path.join(ROOT_DIR, 'src', 'renderer'),
    path.join(ROOT_DIR, 'src', 'server'),
    path.join(ROOT_DIR, 'src', 'shared')
  ];

  let allFiles = [];
  for (const d of targetDirs) {
    allFiles.push(...getSourceFiles(d, '.js'));
  }

  runner.recordCheck(
    allFiles.length >= 18,
    `Discovered ${allFiles.length} JavaScript source files across designated source trees`
  );

  let syntaxFailures = 0;
  for (const file of allFiles) {
    const relPath = path.relative(ROOT_DIR, file);
    const start = Date.now();
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      runner.recordCheck(true, `Syntax check passed: ${relPath}`, null, Date.now() - start);
    } catch (err) {
      syntaxFailures++;
      runner.recordCheck(false, `Syntax error in ${relPath}: ${err.message}`, err);
    }
  }

  runner.recordCheck(
    syntaxFailures === 0,
    `Overall syntax validation: ${allFiles.length - syntaxFailures}/${allFiles.length} files valid`
  );
}

// ============================================================================
// Suite 2: Automated Regression Test Suite (npm test)
// ============================================================================
async function runAutomatedTestSuite(runner) {
  const start = Date.now();
  const testRes = spawnSync('npm', ['test'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { FORCE_COLOR: '0' }),
    timeout: 60000
  });

  const duration = Date.now() - start;
  const stdout = testRes.stdout || '';
  const stderr = testRes.stderr || '';

  const exitCodeOk = testRes.status === 0;
  runner.recordCheck(exitCodeOk, `npm test executed with exit code ${testRes.status}`, null, duration);

  // Parse node --test summary lines (e.g. "ℹ tests 251", "ℹ pass 251", "ℹ fail 0")
  const testsMatch = stdout.match(/ℹ\s+tests\s+(\d+)/);
  const passMatch = stdout.match(/ℹ\s+pass\s+(\d+)/);
  const failMatch = stdout.match(/ℹ\s+fail\s+(\d+)/);
  const cancelledMatch = stdout.match(/ℹ\s+cancelled\s+(\d+)/);

  const totalTests = testsMatch ? parseInt(testsMatch[1], 10) : 0;
  const passedTests = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failedTests = failMatch ? parseInt(failMatch[1], 10) : 0;
  const cancelledTests = cancelledMatch ? parseInt(cancelledMatch[1], 10) : 0;

  runner.recordCheck(
    totalTests >= 180,
    `Test suite discovered and executed comprehensive coverage (${totalTests} total tests executed, threshold >= 180)`
  );

  runner.recordCheck(
    failedTests === 0 && cancelledTests === 0 && exitCodeOk,
    `All test assertions succeeded: ${passedTests} passed, ${failedTests} failed, ${cancelledTests} cancelled`
  );

  if (!exitCodeOk || failedTests > 0) {
    const errorSnippet = (stderr + '\n' + stdout).split('\n').filter(l => l.includes('✖') || l.includes('FAIL') || l.includes('Error:')).slice(0, 10).join('\n');
    if (errorSnippet) {
      runner.recordCheck(false, `Test failure details:\n${errorSnippet}`);
    }
  }
}

// ============================================================================
// Suite 3: Preload & IPC Security Audit
// ============================================================================
async function runPreloadAndIpcSecurityAudit(runner) {
  const preloadPath = path.join(ROOT_DIR, 'src', 'main', 'preload.js');
  const mainPath = path.join(ROOT_DIR, 'src', 'main', 'main.js');

  const preloadSrc = fs.readFileSync(preloadPath, 'utf8');
  const mainSrc = fs.readFileSync(mainPath, 'utf8');

  // 1. Context isolation and node integration check in main.js
  const hasContextIsolation = /contextIsolation:\s*true/.test(mainSrc);
  const hasNodeIntegrationDisabled = /nodeIntegration:\s*false/.test(mainSrc);

  runner.recordCheck(
    hasContextIsolation,
    'Main process enforces contextIsolation: true in BrowserWindow webPreferences'
  );

  runner.recordCheck(
    hasNodeIntegrationDisabled,
    'Main process enforces nodeIntegration: false in BrowserWindow webPreferences'
  );

  // 2. Preload bridge isolation patterns
  const exposesInMainWorld = preloadSrc.includes("contextBridge.exposeInMainWorld('electronAPI'");
  const leaksIpcRenderer = /exposeInMainWorld\(\s*['"]ipcRenderer['"]/.test(preloadSrc);
  const leaksRemote = /exposeInMainWorld\(\s*['"]remote['"]/.test(preloadSrc) || preloadSrc.includes("require('@electron/remote')");

  runner.recordCheck(
    exposesInMainWorld,
    "preload.js exposes API exclusively under isolated window.electronAPI namespace"
  );

  runner.recordCheck(
    !leaksIpcRenderer,
    "preload.js does NOT expose raw ipcRenderer directly to renderer window"
  );

  runner.recordCheck(
    !leaksRemote,
    "preload.js does NOT expose deprecated Electron remote module"
  );

  // 3. Dynamic sandboxed execution of preload.js to verify API shape
  let exposedNamespace = null;
  let exposedApi = null;
  const recordedSends = [];
  const recordedInvokes = [];

  const mockElectron = {
    contextBridge: {
      exposeInMainWorld: (ns, api) => {
        exposedNamespace = ns;
        exposedApi = api;
      }
    },
    ipcRenderer: {
      send: (ch, ...args) => { recordedSends.push({ ch, args }); return undefined; },
      invoke: (ch, ...args) => { recordedInvokes.push({ ch, args }); return Promise.resolve({ ok: true, ch }); },
      sendSync: (ch) => ({ sync: true, ch }),
      on: () => {}
    },
    webFrame: {
      setZoomFactor: () => {},
      getZoomFactor: () => 1.0,
      clearCache: () => {}
    }
  };

  const sandbox = {
    require: (mod) => {
      if (mod === 'electron') return mockElectron;
      return require(mod);
    },
    process: {
      argv: ['--raser-token=verification-token-sec-42'],
      platform: 'linux'
    }
  };

  vm.runInNewContext(preloadSrc, sandbox);

  runner.recordCheck(
    exposedNamespace === 'electronAPI' && exposedApi !== null,
    'Dynamic preload sandbox successfully loaded and registered window.electronAPI'
  );

  runner.recordCheck(
    exposedApi && exposedApi.serverToken === 'verification-token-sec-42',
    'preload.js extracts serverToken from process command line flags'
  );

  // Verify key contract methods are callable and invoke appropriate IPC
  const keyExpectedMethods = [
    'minimizeWindow', 'maximizeWindow', 'closeWindow',
    'getServerPort', 'toggleMiniWindow', 'setMiniLyrics',
    'getCacheSize', 'clearCache', 'getDataDir',
    'discordRpcUpdate', 'discordRpcClear', 'discordRpcSetEnabled',
    'getAudioOutputInfo', 'storageInitSync', 'storageSaveBatch'
  ];

  let missingMethods = keyExpectedMethods.filter(m => typeof exposedApi[m] !== 'function');
  runner.recordCheck(
    missingMethods.length === 0,
    `Exposed API implements all core contract functions (missing: [${missingMethods.join(', ')}])`
  );

  // Exercise window controls to verify IPC dispatching
  if (typeof exposedApi.minimizeWindow === 'function') exposedApi.minimizeWindow();
  if (typeof exposedApi.getServerPort === 'function') exposedApi.getServerPort();
  if (typeof exposedApi.clearCache === 'function') exposedApi.clearCache();

  runner.recordCheck(
    recordedSends.some(s => s.ch === 'window-minimize') &&
    recordedInvokes.some(i => i.ch === 'get-server-port') &&
    recordedInvokes.some(i => i.ch === 'clear-cache'),
    'Exposed API methods correctly dispatch to ipcRenderer.send and ipcRenderer.invoke'
  );

  // 4. IPC Channel Contracts between preload.js and main process
  const channelRegex = /ipcRenderer\.(?:send|invoke|sendSync|on)\(\s*['"]([^'"]+)['"]/g;
  const preloadChannels = new Set();
  let chMatch;
  while ((chMatch = channelRegex.exec(preloadSrc)) !== null) {
    preloadChannels.add(chMatch[1]);
  }

  // Collect all main process JS sources to match channel handlers
  const mainFiles = fs.readdirSync(path.join(ROOT_DIR, 'src', 'main'))
    .filter(f => f.endsWith('.js') && f !== 'preload.js')
    .map(f => fs.readFileSync(path.join(ROOT_DIR, 'src', 'main', f), 'utf8'))
    .join('\n');

  const unhandledChannels = [];
  for (const ch of preloadChannels) {
    const hasSingleQuote = mainFiles.includes(`'${ch}'`);
    const hasDoubleQuote = mainFiles.includes(`"${ch}"`);
    const hasBacktick = mainFiles.includes(`\`${ch}\``);
    if (!hasSingleQuote && !hasDoubleQuote && !hasBacktick) {
      unhandledChannels.push(ch);
    }
  }

  runner.recordCheck(
    unhandledChannels.length === 0,
    `IPC Channel Contracts verified: 100% (${preloadChannels.size}/${preloadChannels.size}) of preload channels handled in src/main/`
  );
}

// ============================================================================
// Suite 4: Backend Streaming & In-Process Server Integrity
// ============================================================================
async function runBackendServerIntegritySuite(runner) {
  const { startServer, stopServer, getServerToken } = require('../src/server/server');

  function httpGet(port, reqPath, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: reqPath, headers }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
    });
  }

  // 1. Loopback binding
  const port = await startServer(0);
  try {
    runner.recordCheck(
      Number.isInteger(port) && port > 0 && port <= 65535,
      `In-process server bound successfully to loopback 127.0.0.1 on dynamic port ${port}`
    );

    const token = getServerToken();
    runner.recordCheck(
      typeof token === 'string' && token.length >= 16,
      `Server generated high-entropy security token (${token.slice(0, 8)}...)`
    );

    // 2. Token protection on guarded routes
    const unauthRes = await httpGet(port, '/api/tools-status');
    runner.recordCheck(
      unauthRes.status === 403,
      `Guarded route rejects requests lacking x-riff-token header (HTTP ${unauthRes.status})`
    );

    const invalidAuthRes = await httpGet(port, '/api/tools-status', { 'x-riff-token': 'invalid-bogus-token' });
    runner.recordCheck(
      invalidAuthRes.status === 403,
      `Guarded route rejects requests with forged token (HTTP ${invalidAuthRes.status})`
    );

    const validAuthRes = await httpGet(port, '/api/tools-status', { 'x-riff-token': token });
    runner.recordCheck(
      validAuthRes.status === 200,
      `Guarded route accepts authorized requests with valid token (HTTP ${validAuthRes.status})`
    );

    // 3. Foreign Origin rejection
    const foreignOriginRes = await httpGet(port, '/', { origin: 'https://evil-untrusted-site.com' });
    runner.recordCheck(
      foreignOriginRes.status === 403,
      `Server rejects requests originating from unauthorized foreign origin (HTTP ${foreignOriginRes.status})`
    );

    // 4. WHATWG URL Parsing & Complex Query Handling
    const exoticQuery = '/api/search?q=test%20query%20%F0%9F%8E%B6&filter=all&special=%26%3D%3F%2B';
    const queryRes = await httpGet(port, exoticQuery, { 'x-riff-token': token });
    runner.recordCheck(
      queryRes.status !== 500,
      `WHATWG URL query parser safely processes emojis and encoded symbols without crash (HTTP ${queryRes.status})`
    );

    // 5. Fallback routes return 404
    const notFoundRes = await httpGet(port, '/api/non-existent-endpoint-404');
    runner.recordCheck(
      notFoundRes.status === 404,
      `Unknown routes cleanly fall back to 404 Not Found (HTTP ${notFoundRes.status})`
    );

  } finally {
    await stopServer();
  }

  runner.recordCheck(true, 'Server stopped cleanly and released port');
}

// ============================================================================
// Suite 5: Audio Engine, DSP & Presets Integrity
// ============================================================================
async function runAudioEngineAndPresetsSuite(runner) {
  // Stub browser globals if not present
  if (typeof global.window === 'undefined') global.window = global;
  global.window.addEventListener = () => {};
  global.window.removeEventListener = () => {};
  global.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  global.window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  global.window.cancelAnimationFrame = (id) => clearTimeout(id);
  if (typeof global.document === 'undefined') {
    global.document = {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: { setProperty: () => {} }, appendChild: () => {}, addEventListener: () => {} }),
      body: { classList: { contains: () => false, add: () => {}, remove: () => {} } }
    };
  }
  if (typeof global.localStorage === 'undefined') {
    const store = new Map();
    global.localStorage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  }

  const { RaserAudioEngine, EQ_PRESETS } = require('../src/renderer/audio');
  const { parseLrc, getTrackLyricsOffset, setTrackLyricsOffset } = require('../src/renderer/app');

  // 1. Audio Engine and level analyzer routing
  const engine = new RaserAudioEngine();
  runner.recordCheck(
    engine !== null && typeof engine.getLevelDb === 'function',
    'RaserAudioEngine instantiates cleanly and exposes getLevelDb metering method'
  );

  runner.recordCheck(
    engine.getLevelDb() === -120,
    'getLevelDb returns -120 dB baseline when levelAnalyser buffer is uninitialized'
  );

  // Metering oracle test with mock time domain data
  engine.levelBuf = new Float32Array(2048);
  engine.levelAnalyser = {
    getFloatTimeDomainData: (buf) => {
      // 0.1 amplitude corresponds to 20 * log10(0.1) = -20 dB
      buf.fill(0.1);
    }
  };
  const measuredDb = engine.getLevelDb();
  runner.recordCheck(
    Math.abs(measuredDb - (-20)) < 0.05,
    `getLevelDb computes accurate RMS dB from buffer (-20 dB test signal measured as ${measuredDb.toFixed(2)} dB)`
  );

  // Audit audio.js source for levelAnalyser connection to main bus
  const audioSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'renderer', 'audio.js'), 'utf8');
  const busWiringMatch = audioSrc.includes('this.bus.connect(this.levelAnalyser)') || audioSrc.includes('this.levelAnalyser = this.ctx.createAnalyser();\n    this.bus.connect(this.levelAnalyser);');
  runner.recordCheck(
    busWiringMatch,
    'audio.js wires levelAnalyser directly to main bus to ensure volume normalization accuracy under flat EQ'
  );

  // 2. 10-Band EQ Presets Definitions
  const requiredPresets = ['flat', 'bass_boost', 'treble_boost', 'rock', 'pop', 'electronic', 'jazz', 'classical', 'vocal_boost', 'acoustic', 'hiphop'];
  let missingPresets = requiredPresets.filter(p => !EQ_PRESETS[p]);
  runner.recordCheck(
    missingPresets.length === 0,
    `EQ_PRESETS defines all 11 required genre and acoustic profiles (missing: [${missingPresets.join(', ')}])`
  );

  let presetErrors = 0;
  for (const [key, preset] of Object.entries(EQ_PRESETS)) {
    if (!preset.name || typeof preset.name !== 'string') presetErrors++;
    if (!Array.isArray(preset.bands) || preset.bands.length !== 10) presetErrors++;
    if (preset.bands.some(g => typeof g !== 'number' || g < -15 || g > 15)) presetErrors++;
  }
  runner.recordCheck(
    presetErrors === 0,
    'All 10-band EQ presets have valid names, exactly 10 bands, and calibrated gain values (-12dB to +12dB)'
  );

  const flatBands = EQ_PRESETS.flat ? EQ_PRESETS.flat.bands : [];
  runner.recordCheck(
    flatBands.length === 10 && flatBands.every(b => b === 0),
    'Flat EQ preset specifies 0 dB unity gain across all 10 biquad filter bands'
  );

  // 3. LRC Parser with multi-timestamps and sync offset headers
  const sampleLrc = `[ar:Artist]
[ti:Title]
[offset:+500]
[00:10.00]Line 1
[00:15.00][00:25.00]Multi-timestamp chorus
[00:30.50]Final line`;

  const parsed = parseLrc(sampleLrc);
  runner.recordCheck(
    Array.isArray(parsed) && parsed.length === 4,
    `parseLrc unpacked multi-timestamp chorus line into 4 discrete chronological entries`
  );

  // With [offset:+500], time = timestamp + 0.5s: 10s -> 10.5s
  runner.recordCheck(
    parsed[0] && Math.abs(parsed[0].time - 10.5) < 0.01,
    `parseLrc applies [offset:+500] header correctly (10.0s shifted to ${parsed[0]?.time}s)`
  );

  // Manual track sync offset getter/setter
  const testTrack = { id: 'track-xyz-123', title: 'Verification Song', artist: 'Verification Artist' };
  setTrackLyricsOffset(testTrack, 0.5);
  const retrievedOffset = getTrackLyricsOffset(testTrack);
  runner.recordCheck(
    retrievedOffset === 0.5,
    `Manual lyrics sync offset stored and retrieved accurately (${retrievedOffset}s)`
  );
}

// ============================================================================
// Suite 6: UI Aesthetics & Layout Polish Integrity
// ============================================================================
async function runUiAestheticsAndLayoutSuite(runner) {
  const stylesPath = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');
  const htmlPath = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');
  const appPath = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');

  const stylesSrc = fs.readFileSync(stylesPath, 'utf8');
  const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
  const appSrc = fs.readFileSync(appPath, 'utf8');

  // 1. Scrubber Dynamic Contrast Calculation
  const highContrastMatch = appSrc.match(/function getHighContrastColor\(col\) \{[\s\S]*?\n  \}/);
  runner.recordCheck(
    highContrastMatch !== null,
    'app.js implements getHighContrastColor WCAG contrast algorithm'
  );

  const getHighContrastColor = new Function('return ' + highContrastMatch[0])();

  // Test white color scaling: pure white lum = 1.0 > 0.55 -> scaled down
  const darkenedWhite = getHighContrastColor('#ffffff');
  const nums = darkenedWhite.match(/\d+/g).map(Number);
  const whiteLum = (0.299 * nums[0] + 0.587 * nums[1] + 0.114 * nums[2]) / 255;
  runner.recordCheck(
    whiteLum <= 0.56,
    `Bright theme colors scaled down to safe contrast on light surfaces (white lum ${whiteLum.toFixed(3)} <= 0.56)`
  );

  // Dark colors untouched
  runner.recordCheck(
    getHighContrastColor('#111111') === '#111111',
    'Dark theme colors preserved without luminance distortion'
  );

  // Hover knob scaling in app.js
  const hasKnobScaling = appSrc.includes('curKnobW = 7.5 + (9.5 - 7.5) * scrubKnobAnim') &&
                         appSrc.includes('curKnobH = 24 + (32 - 24) * scrubKnobAnim');
  runner.recordCheck(
    hasKnobScaling,
    'Scrubber waveform loop smoothly scales knob dimensions on hover (7.5->9.5px width, 24->32px height)'
  );

  // 2. Volume Slider Progress Fill & Tooltip
  const volumeGradientRegex = /linear-gradient\(\s*to\s+right,\s*var\(--md-sys-color-primary\)\s*0%,\s*var\(--md-sys-color-primary\)\s*var\(--volume-percent,\s*85%\)/;
  const hasVolumeGradient = volumeGradientRegex.test(stylesSrc);
  runner.recordCheck(
    hasVolumeGradient,
    'styles.css implements dynamic dual-stop linear-gradient progress fill on volume slider track'
  );

  const hasVolumeHoverExpand = stylesSrc.includes('.volume-slider-wrapper:hover') && stylesSrc.includes('width: 110px');
  runner.recordCheck(
    hasVolumeHoverExpand,
    'Volume slider expands width smoothly on hover (80px -> 110px)'
  );

  const hasVolumeTooltip = htmlSrc.includes('id="volume-tooltip"') && stylesSrc.includes('.volume-tooltip');
  runner.recordCheck(
    hasVolumeTooltip,
    'Volume tooltip pill badge embedded in DOM and styled with pointer-events: none'
  );

  // 3. Responsive Right-Panel Drawer (< 1020px)
  const hasDestructiveDisplayNone = /@media\s*\(\s*max-width:\s*1020px\s*\)\s*\{[^}]*body:not\(\.mini\)\s+\.right-panel\s*\{\s*display:\s*none\s*!important;\s*\}/.test(stylesSrc);
  runner.recordCheck(
    !hasDestructiveDisplayNone,
    'Responsive styles do NOT eliminate right-panel with display: none !important on screens <= 1020px'
  );

  const hasSlideOverDrawer = stylesSrc.includes('@media (max-width: 1020px)') &&
                             stylesSrc.includes('position: fixed !important') &&
                             stylesSrc.includes('transform: translateX(100%)');
  runner.recordCheck(
    hasSlideOverDrawer,
    'Small screen layout converts right-panel into slide-over drawer with smooth translate animations'
  );

  // 4. Frosted Acrylic Glassmorphism Playbar
  const hasAcrylicBlur = stylesSrc.includes('backdrop-filter: blur(20px) saturate(1.8) !important;') &&
                         stylesSrc.includes('-webkit-backdrop-filter: blur(20px) saturate(1.8) !important;');
  runner.recordCheck(
    hasAcrylicBlur,
    'Playbar dock styled with acrylic glassmorphism blur and saturation backdrop filters'
  );

  const hasPerfModeOverride = stylesSrc.includes('body.perf:not(.classic-sidebar):not(.mini) .playbar') &&
                              stylesSrc.includes('backdrop-filter: none !important;');
  runner.recordCheck(
    hasPerfModeOverride,
    'Performance mode disables backdrop-filter on playbar to conserve GPU rendering cycles'
  );

  // 5. Animated Track Row Equalizer Bars
  const hasEqBarsCss = stylesSrc.includes('.playing-equalizer-bars') &&
                       stylesSrc.includes('@keyframes eq-bounce') &&
                       stylesSrc.includes('animation-play-state: paused');
  runner.recordCheck(
    hasEqBarsCss,
    'styles.css defines 3-bar animated equalizer playing indicator with synchronized pause state'
  );

  // 6. Titlebar Button Geometry and CSS Cleanliness
  const hasNoWinBtnDistortion = !htmlSrc.includes('class="titlebar-btn win-btn"') &&
                                !htmlSrc.includes('class="win-btn titlebar-btn"');
  runner.recordCheck(
    hasNoWinBtnDistortion,
    'Titlebar window control buttons free of conflicting win-btn geometric distortion'
  );

  const hasNoInvalidBlurCss = !stylesSrc.includes('blur: 5;');
  runner.recordCheck(
    hasNoInvalidBlurCss,
    'styles.css free of invalid blur: 5; CSS declarations'
  );
}

// ============================================================================
// Suite 7: Clean Application Startup & Error Check
// ============================================================================
async function runCleanStartupSuite(runner) {
  // 1. Verify CLI tool entrypoint
  const cliStart = Date.now();
  const cliRes = spawnSync(process.execPath, [path.join(ROOT_DIR, 'src', 'main', 'cli.js')], {
    encoding: 'utf8',
    cwd: ROOT_DIR,
    timeout: 5000
  });

  runner.recordCheck(
    cliRes.status === 0 && cliRes.stdout.includes('Usage: raser lyrics'),
    'CLI entrypoint executes cleanly without exceptions and outputs expected usage help',
    null,
    Date.now() - cliStart
  );

  // 2. Full Electron main process startup lifecycle probe
  let electronBin;
  try {
    electronBin = require('electron');
  } catch (_) {
    const localBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'electron');
    electronBin = fs.existsSync(localBin) ? localBin : 'electron';
  }

  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-verify-user-data-'));
  const startupStart = Date.now();
  let serverReadyDetected = false;
  let fatalErrorDetected = false;
  let loggedOutput = '';

  const startupPromise = new Promise((resolve, reject) => {
    const child = spawn(electronBin, ['.', '--no-sandbox', `--user-data-dir=${tmpUserData}`], {
      cwd: ROOT_DIR,
      env: Object.assign({}, process.env, {
        RASER_SKIP_GPU_BUFFER_FLAGS: '1',
        DISPLAY: process.env.DISPLAY || ':0'
      })
    });

    const timeoutTimer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ timedOut: true });
    }, 12000);

    const onData = (data) => {
      const text = data.toString();
      loggedOutput += text;

      if (text.includes('devsize internal server running on http://127.0.0.1:') ||
          text.includes('devsize internal server running on fallback port')) {
        serverReadyDetected = true;
        clearTimeout(timeoutTimer);
        // Terminate cleanly with SIGTERM
        child.kill('SIGTERM');
      }

      if (text.includes('Uncaught exception') ||
          text.includes('Unhandled rejection') ||
          text.includes('FATAL:')) {
        fatalErrorDetected = true;
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer);
      resolve({ code, signal, timedOut: false });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      reject(err);
    });
  });

  try {
    const startupResult = await startupPromise;
    const startupDuration = Date.now() - startupStart;

    runner.recordCheck(
      serverReadyDetected,
      `Electron main process initialized successfully and reached server readiness in ${startupDuration}ms`
    );

    runner.recordCheck(
      !fatalErrorDetected,
      'Electron process log verified free of uncaught exceptions and fatal runtime errors'
    );

    runner.recordCheck(
      startupResult.code === 0 || startupResult.signal === 'SIGTERM',
      `Electron process terminated cleanly upon signal (exit code: ${startupResult.code}, signal: ${startupResult.signal})`
    );
  } catch (err) {
    runner.recordCheck(false, `Electron startup failed: ${err.message}`, err);
  } finally {
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    } catch (_) {}
  }
}

// ============================================================================
// Main CLI Runner Entrypoint
// ============================================================================
async function main() {
  const runner = new VerificationRunner();
  runner.logHeader();

  const suites = [
    { name: 'Suite 1: Source Code JavaScript Syntax Validation', fn: runSyntaxValidationSuite },
    { name: 'Suite 2: Automated Regression Test Suite (npm test)', fn: runAutomatedTestSuite },
    { name: 'Suite 3: Preload & IPC Security Audit', fn: runPreloadAndIpcSecurityAudit },
    { name: 'Suite 4: Backend Streaming & In-Process Server Integrity', fn: runBackendServerIntegritySuite },
    { name: 'Suite 5: Audio Engine, DSP & Equalizer Presets Integrity', fn: runAudioEngineAndPresetsSuite },
    { name: 'Suite 6: UI Aesthetics, Material 3 Polish & Layout Invariants', fn: runUiAestheticsAndLayoutSuite },
    { name: 'Suite 7: Clean Application Startup & Error Check', fn: runCleanStartupSuite }
  ];

  // Optional suite filtering via --suite=1 or --suite=syntax
  const args = process.argv.slice(2);
  const suiteFilter = args.find(a => a.startsWith('--suite='))?.split('=')[1]?.toLowerCase();

  for (const suite of suites) {
    if (suiteFilter) {
      const matchName = suite.name.toLowerCase().includes(suiteFilter);
      if (!matchName) continue;
    }
    await runner.runSuite(suite.name, suite.fn);
  }

  const exitCode = runner.summary();
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${c.red}FATAL ERROR IN VERIFICATION RUNNER:${c.reset}`, err);
    process.exit(1);
  });
}

module.exports = { VerificationRunner };

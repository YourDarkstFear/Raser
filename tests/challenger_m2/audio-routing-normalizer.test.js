const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Provide minimal browser mocks for Node environment
if (typeof global.window === 'undefined') {
  global.window = global;
}
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
global.window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window.cancelAnimationFrame = (id) => clearTimeout(id);

// Target module
const { RaserAudioEngine, RiffAudioEngine, EQ_PRESETS } = require('../../src/renderer/audio');

// Web Audio Graph Mock Harness
function createMockWebAudioEnvironment() {
  class MockAudioParam {
    constructor(defaultValue = 0) {
      this.value = defaultValue;
      this.targetValue = defaultValue;
      this.timeConstant = 0;
    }
    setTargetAtTime(target, startTime, timeConstant) {
      this.targetValue = target;
      this.timeConstant = timeConstant;
      this.value = target;
    }
    setValueAtTime(val) {
      this.value = val;
    }
    linearRampToValueAtTime(val) {
      this.value = val;
    }
  }

  class MockAudioNode {
    constructor(name) {
      this.nodeName = name;
      this.connections = new Set();
      this.gain = new MockAudioParam(1.0);
      this.frequency = new MockAudioParam(1000);
      this.Q = new MockAudioParam(1.0);
      this.threshold = new MockAudioParam(-24);
      this.knee = new MockAudioParam(30);
      this.ratio = new MockAudioParam(12);
      this.attack = new MockAudioParam(0.003);
      this.release = new MockAudioParam(0.25);
      this.delayTime = new MockAudioParam(0.3);
      this.fftSize = 2048;
    }

    connect(destination) {
      if (destination) {
        this.connections.add(destination);
      }
      return destination;
    }

    disconnect(destination) {
      if (destination) {
        this.connections.delete(destination);
      } else {
        this.connections.clear();
      }
    }

    isConnectedTo(node) {
      return this.connections.has(node);
    }
  }

  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = new MockAudioNode('destination');
    }

    createGain() { return new MockAudioNode('gain'); }
    createBiquadFilter() { return new MockAudioNode('biquad'); }
    createAnalyser() { return new MockAudioNode('analyser'); }
    createDynamicsCompressor() { return new MockAudioNode('compressor'); }
    createWaveShaper() { return new MockAudioNode('waveshaper'); }
    createDelay() { return new MockAudioNode('delay'); }
    createConvolver() { return new MockAudioNode('convolver'); }
    createMediaElementSource() { return new MockAudioNode('mediaSource'); }
    createBufferSource() { return new MockAudioNode('bufferSource'); }
    createBuffer(channels, length, sampleRate) {
      const len = length || 44100;
      const ch1 = new Float32Array(len);
      const ch2 = new Float32Array(len);
      return {
        numberOfChannels: channels || 2,
        length: len,
        sampleRate: sampleRate || 44100,
        getChannelData: (ch) => (ch === 1 ? ch2 : ch1)
      };
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  return { MockAudioContext, MockAudioNode };
}

test('Challenger M2 - Web Audio Routing & Level Analyser Verification', async (t) => {
  const { MockAudioContext } = createMockWebAudioEnvironment();

  await t.test('levelAnalyser is connected to this.bus and NEVER directly to eqHigh', () => {
    const engine = new RaserAudioEngine();
    const mockCtx = new MockAudioContext();
    const mockAudioEl = {
      paused: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    engine.ctx = mockCtx;
    engine.init(mockAudioEl);

    assert.ok(engine.graphInitialized, 'Graph should be initialized');
    assert.ok(engine.bus, 'engine.bus must exist');
    assert.ok(engine.levelAnalyser, 'engine.levelAnalyser must exist');
    assert.ok(engine.eqHigh, 'engine.eqHigh must exist');

    // Assert levelAnalyser is connected from this.bus
    assert.ok(
      engine.bus.isConnectedTo(engine.levelAnalyser),
      'engine.bus MUST be connected to engine.levelAnalyser'
    );

    // Assert levelAnalyser is NOT connected from eqHigh
    assert.ok(
      !engine.eqHigh.isConnectedTo(engine.levelAnalyser),
      'engine.eqHigh must NOT be connected to engine.levelAnalyser'
    );
  });

  await t.test('levelAnalyser routing invariant holds across all 32 permutations of DSP states', () => {
    const bools = [false, true];

    for (const isEqOn of bools) {
      for (const isReverbOn of bools) {
        for (const isEchoOn of bools) {
          for (const isDistortionOn of bools) {
            for (const isHqOn of bools) {
              const engine = new RaserAudioEngine();
              const mockCtx = new MockAudioContext();
              const mockAudioEl = { paused: false, addEventListener: () => {}, removeEventListener: () => {} };
              engine.ctx = mockCtx;
              engine.init(mockAudioEl);

              // Configure engine DSP settings
              engine.hqEnabled = isHqOn;
              engine.audioSettings = {
                eq: { low: 0, mid: 0, high: 0 },
                eqBands: isEqOn ? [3, 2, 1, 0, 0, 0, 0, 1, 2, 3] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                reverb: isReverbOn ? 0.5 : 0,
                echo: isEchoOn ? 0.3 : 0,
                distortion: isDistortionOn ? 0.4 : 0
              };

              // Force routing state change and update
              engine._routingState = null;
              engine._updateRouting();

              // Verify levelAnalyser invariant
              assert.ok(
                engine.bus.isConnectedTo(engine.levelAnalyser),
                `levelAnalyser must remain connected to this.bus in state Eq=${isEqOn}, Rev=${isReverbOn}, Echo=${isEchoOn}, Dist=${isDistortionOn}, HQ=${isHqOn}`
              );

              assert.ok(
                !engine.eqHigh.isConnectedTo(engine.levelAnalyser),
                `levelAnalyser must NEVER be connected to eqHigh in state Eq=${isEqOn}, Rev=${isReverbOn}, Echo=${isEchoOn}, Dist=${isDistortionOn}, HQ=${isHqOn}`
              );
            }
          }
        }
      }
    }
  });

  await t.test('getLevelDb returns accurate dB measurements across realistic signal levels', () => {
    const engine = new RaserAudioEngine();
    engine.levelBuf = new Float32Array(2048);

    let syntheticBuffer = new Float32Array(2048);
    engine.levelAnalyser = {
      getFloatTimeDomainData: (targetBuf) => {
        targetBuf.set(syntheticBuffer);
      }
    };

    // Test Case 1: Full-scale DC signal (RMS = 1.0 -> 0 dBFS)
    syntheticBuffer.fill(1.0);
    let db = engine.getLevelDb();
    assert.ok(Math.abs(db - 0) < 0.001, `Full scale signal expected 0 dB, got ${db}`);

    // Test Case 2: Nominal -6 dB signal (RMS = 0.5 -> 20*log10(0.5) = -6.0206 dB)
    syntheticBuffer.fill(0.5);
    db = engine.getLevelDb();
    assert.ok(Math.abs(db - (-6.0206)) < 0.01, `RMS 0.5 signal expected ~ -6.02 dB, got ${db}`);

    // Test Case 3: Quiet -20 dB signal (RMS = 0.1 -> -20 dB)
    syntheticBuffer.fill(0.1);
    db = engine.getLevelDb();
    assert.ok(Math.abs(db - (-20)) < 0.01, `RMS 0.1 signal expected ~ -20 dB, got ${db}`);

    // Test Case 4: Very quiet -40 dB signal (RMS = 0.01 -> -40 dB)
    syntheticBuffer.fill(0.01);
    db = engine.getLevelDb();
    assert.ok(Math.abs(db - (-40)) < 0.01, `RMS 0.01 signal expected ~ -40 dB, got ${db}`);

    // Test Case 5: Realistic sine wave signal: A = 0.8, RMS = A / sqrt(2) ≈ 0.56568 -> -4.9485 dB
    for (let i = 0; i < syntheticBuffer.length; i++) {
      syntheticBuffer[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    db = engine.getLevelDb();
    assert.ok(Math.abs(db - (-4.95)) < 0.1, `Sine wave expected ~ -4.95 dB, got ${db}`);

    // Test Case 6: Silent buffer (all zeros) -> returns -120 dB floor
    syntheticBuffer.fill(0);
    db = engine.getLevelDb();
    assert.equal(db, -120, 'Silent buffer must return -120 dB floor');
  });

  await t.test('getLevelDb handles adversarial and corrupted buffer values gracefully', () => {
    const engine = new RaserAudioEngine();
    engine.levelBuf = new Float32Array(2048);

    let corruptBuffer = new Float32Array(2048);
    engine.levelAnalyser = {
      getFloatTimeDomainData: (targetBuf) => {
        targetBuf.set(corruptBuffer);
      }
    };

    // NaN values: should fallback to -120 dB instead of crashing or returning NaN
    corruptBuffer.fill(NaN);
    let db = engine.getLevelDb();
    assert.equal(db, -120, 'Buffer with NaN values must return -120 dB fallback');

    // Null/undefined levelAnalyser
    engine.levelAnalyser = null;
    db = engine.getLevelDb();
    assert.equal(db, -120, 'Uninitialized levelAnalyser must return -120 dB');
  });

  await t.test('setNormalizeGainDb applies accurate gain multiplier curve to normGain', () => {
    const engine = new RaserAudioEngine();
    const { MockAudioContext } = createMockWebAudioEnvironment();
    engine.ctx = new MockAudioContext();
    engine.normGain = engine.ctx.createGain();

    // 0 dB -> factor 1.0
    engine.setNormalizeGainDb(0);
    assert.ok(Math.abs(engine.normGain.gain.targetValue - 1.0) < 0.001);

    // -6 dB -> factor ~0.501187
    engine.setNormalizeGainDb(-6);
    assert.ok(Math.abs(engine.normGain.gain.targetValue - 0.501187) < 0.001);

    // +6 dB -> factor ~1.99526
    engine.setNormalizeGainDb(6);
    assert.ok(Math.abs(engine.normGain.gain.targetValue - 1.99526) < 0.001);

    // Null normGain or ctx safe against exceptions
    engine.normGain = null;
    assert.doesNotThrow(() => engine.setNormalizeGainDb(-3));
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');

// Provide browser globals mock before requiring renderer scripts in Node test env
if (typeof global.window === 'undefined') {
  global.window = global;
}
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
    createElement: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } }
  };
}

// Target module
const { parseLrc } = require('../../src/renderer/app');

test('Challenger M2 - Enhanced LRC Parser Adversarial & Stress Suite', async (t) => {
  await t.test('handles 500+ timestamp tags on a single line with linear performance and correct order', () => {
    const NUM_TAGS = 500;
    const tags = [];
    for (let i = 0; i < NUM_TAGS; i++) {
      const min = Math.floor(i / 60);
      const sec = (i % 60).toString().padStart(2, '0');
      tags.push(`[${min.toString().padStart(2, '0')}:${sec}.00]`);
    }

    const singleLine500 = `${tags.join('')}Repeat chorus line`;
    const t0 = performance.now();
    const parsed = parseLrc(singleLine500);
    const durationMs = performance.now() - t0;

    assert.equal(parsed.length, NUM_TAGS, `Expected exactly ${NUM_TAGS} parsed items`);
    assert.ok(durationMs < 100, `Parsing 500 tags took ${durationMs.toFixed(2)}ms, expected < 100ms`);

    // Verify all items have identical text and monotonically increasing timestamps
    for (let i = 0; i < NUM_TAGS; i++) {
      assert.equal(parsed[i].text, 'Repeat chorus line');
      assert.equal(parsed[i].time, i);
      if (i > 0) {
        assert.ok(parsed[i].time > parsed[i - 1].time, `Timestamp at ${i} must be greater than ${i - 1}`);
      }
    }
  });

  await t.test('handles malformed, extreme, and corrupted [offset:...] headers safely', () => {
    // 1. Missing value
    const p1 = parseLrc('[offset:]\n[00:05.00]Test');
    assert.equal(p1.length, 1);
    assert.equal(p1[0].time, 5.0);

    // 2. Alpha characters inside offset
    const p2 = parseLrc('[offset:abc]\n[00:05.00]Test');
    assert.equal(p2.length, 1);
    assert.equal(p2[0].time, 5.0);

    // 3. Whitespace variations: [offset:   +500   ]
    const p3 = parseLrc('[offset:   +500   ]\n[00:05.00]Test');
    assert.equal(p3.length, 1);
    assert.equal(p3[0].time, 5.5, '5.0s + 0.5s = 5.5s');

    // 4. Double sign [offset:+-100]
    const p4 = parseLrc('[offset:+-100]\n[00:05.00]Test');
    assert.equal(p4.length, 1);
    assert.equal(p4[0].time, 5.0);

    // 5. Extreme negative offset: clamped cleanly to 0s
    const p5 = parseLrc('[offset:-999999]\n[00:05.00]Test');
    assert.equal(p5.length, 1);
    assert.equal(p5[0].time, 0, 'Negative result must clamp to 0s');

    // 6. Huge positive offset
    const p6 = parseLrc('[offset:60000]\n[00:05.00]Test');
    assert.equal(p6.length, 1);
    assert.equal(p6[0].time, 65.0, '5.0s + 60.0s = 65.0s');
  });

  await t.test('strictly sorts out-of-order timestamps ascending across lines and within lines', () => {
    const lrcOutOfOrder = `
[02:00.00]Third line in time, first in text
[00:10.00]First line in time, second in text
[01:00.00]Second line in time, third in text
[00:45.00][00:05.00]Mixed intra-line timestamps
`;
    const parsed = parseLrc(lrcOutOfOrder);

    assert.equal(parsed.length, 5);
    // Expected order:
    // 00:05.00 (5.0s) -> Mixed intra-line
    // 00:10.00 (10.0s) -> First line
    // 00:45.00 (45.0s) -> Mixed intra-line
    // 01:00.00 (60.0s) -> Second line
    // 02:00.00 (120.0s) -> Third line

    assert.equal(parsed[0].time, 5.0);
    assert.equal(parsed[0].text, 'Mixed intra-line timestamps');

    assert.equal(parsed[1].time, 10.0);
    assert.equal(parsed[1].text, 'First line in time, second in text');

    assert.equal(parsed[2].time, 45.0);
    assert.equal(parsed[2].text, 'Mixed intra-line timestamps');

    assert.equal(parsed[3].time, 60.0);
    assert.equal(parsed[3].text, 'Second line in time, third in text');

    assert.equal(parsed[4].time, 120.0);
    assert.equal(parsed[4].text, 'Third line in time, first in text');
  });

  await t.test('parses centisecond, millisecond, and colon-delimited variations accurately', () => {
    const testCases = [
      { lrc: '[01:15.50]Two-digit centisecond', expected: 75.5 },
      { lrc: '[01:15:50]Colon-delimited centisecond', expected: 75.5 },
      { lrc: '[01:15.500]Three-digit millisecond', expected: 75.5 },
      { lrc: '[01:15.5]Single-digit tenth', expected: 75.5 },
      { lrc: '[01:15]No fraction integer second', expected: 75.0 },
      { lrc: '[1:5.2]Single digit min and sec', expected: 65.2 },
      { lrc: '[00:00.00]Start of song', expected: 0.0 }
    ];

    for (const { lrc, expected } of testCases) {
      const res = parseLrc(lrc);
      assert.equal(res.length, 1, `Failed to parse: ${lrc}`);
      assert.ok(Math.abs(res[0].time - expected) < 0.001, `Expected ${expected}s for ${lrc}, got ${res[0].time}s`);
    }
  });

  await t.test('correctly detects gap / instrumental lines and separates untimed lines', () => {
    const lrcWithGaps = `
[00:01.00]Intro lyric
[00:10.00]♪ ♫ ♪
[00:20.00](instrumental)
[00:30.00][guitar solo]
[00:40.00]--–
[00:50.00]Outro lyric
Untimed trailing line 1
Untimed trailing line 2
`;
    const parsed = parseLrc(lrcWithGaps);

    assert.equal(parsed.length, 8);

    // Timed lyrics
    assert.equal(parsed[0].time, 1.0);
    assert.equal(parsed[0].text, 'Intro lyric');
    assert.ok(!parsed[0].isGap);

    // Gaps
    assert.equal(parsed[1].time, 10.0);
    assert.ok(parsed[1].isGap, '♪ ♫ ♪ must be identified as gap');

    assert.equal(parsed[2].time, 20.0);
    assert.ok(parsed[2].isGap, '(instrumental) must be identified as gap');

    assert.equal(parsed[3].time, 30.0);
    assert.ok(parsed[3].isGap, '[guitar solo] must be identified as gap');

    assert.equal(parsed[4].time, 40.0);
    assert.ok(parsed[4].isGap, '--– dashes must be identified as gap');

    assert.equal(parsed[5].time, 50.0);
    assert.equal(parsed[5].text, 'Outro lyric');
    assert.ok(!parsed[5].isGap);

    // Untimed lines at the end with time = -1
    assert.equal(parsed[6].time, -1);
    assert.equal(parsed[6].text, 'Untimed trailing line 1');
    assert.equal(parsed[7].time, -1);
    assert.equal(parsed[7].text, 'Untimed trailing line 2');
  });

  await t.test('preserves unicode, multilingual characters, and emojis in lyrics', () => {
    const multilingualLrc = `
[00:01.00]Türkçe: Yağmur yağıyor, çeşmeler akıyor, şükürler olsun
[00:05.00]Русский: Привет мир, как ваши дела?
[00:10.00]日本語: 桜が満開の季節ですね
[00:15.00]العربية: موسيقى هادئة ورائعة
[00:20.00]Emojis: 🔥 🎧 🎶 🚀 🌟
`;
    const parsed = parseLrc(multilingualLrc);

    assert.equal(parsed.length, 5);
    assert.equal(parsed[0].text, 'Türkçe: Yağmur yağıyor, çeşmeler akıyor, şükürler olsun');
    assert.equal(parsed[1].text, 'Русский: Привет мир, как ваши дела?');
    assert.equal(parsed[2].text, '日本語: 桜が満開の季節ですね');
    assert.equal(parsed[3].text, 'العربية: موسيقى هادئة ورائعة');
    assert.equal(parsed[4].text, 'Emojis: 🔥 🎧 🎶 🚀 🌟');
  });

  await t.test('fuzz test: 50 randomized inputs execute without crashing or hanging', () => {
    const fuzzPatterns = [
      '',
      null,
      undefined,
      12345,
      {},
      '[[[[[[[[]]]]]]]',
      '[:.:.:.]',
      '[99:99:99:99]',
      '[--:--.--]',
      '[00:00.00]',
      '['.repeat(100),
      ']'.repeat(100),
      '<'.repeat(50) + '>'.repeat(50),
      '[offset:NaN][00:01.00]Test',
      '[offset:Infinity][00:01.00]Test',
      '\u0000\u0001\u0002\u0003[00:01.00]\uD83D\uDCA9',
      '[ti:Title][ar:Artist][al:Album][by:Author][offset:0]',
      '[00:00.00]<00:00.00>One <00:01.00>Two <00:02.00>Three'
    ];

    for (let i = 0; i < 50; i++) {
      const candidate = fuzzPatterns[i % fuzzPatterns.length];
      assert.doesNotThrow(() => {
        const res = parseLrc(candidate);
        assert.ok(Array.isArray(res), 'parseLrc must always return an array');
      }, `Fuzz candidate ${i} failed`);
    }
  });
});

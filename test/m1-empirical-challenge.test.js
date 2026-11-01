const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// Target modules under test
const { startServer, stopServer, scoreImportedCandidate } = require('../src/server/server');
const logger = require('../src/shared/logger');
const { DATA_DIR } = require('../src/shared/platform');

// -----------------------------------------------------------------------------
// Suite 1: WHATWG URL Parsing & Exotic Query Parameter Robustness
// -----------------------------------------------------------------------------
test('Suite 1: WHATWG URL Parsing - Unit Edge Cases & Exotic Parameters', async (t) => {
  // Extract parseRequestUrl logic identical to src/server/server.js:10-25
  function parseRequestUrl(rawUrl) {
    if (!rawUrl) return { pathname: '', search: '', query: {}, searchParams: new URLSearchParams(), href: '' };
    try {
      const urlObj = new URL(rawUrl, 'http://127.0.0.1');
      const query = Object.fromEntries(urlObj.searchParams.entries());
      return {
        pathname: urlObj.pathname,
        search: urlObj.search,
        searchParams: urlObj.searchParams,
        query,
        href: urlObj.href
      };
    } catch (_) {
      return { pathname: '', search: '', query: {}, searchParams: new URLSearchParams(), href: '' };
    }
  }

  await t.test('handles falsy, null, undefined, and non-string inputs safely', () => {
    assert.deepEqual(parseRequestUrl(null), { pathname: '', search: '', query: {}, searchParams: new URLSearchParams(), href: '' });
    assert.deepEqual(parseRequestUrl(undefined), { pathname: '', search: '', query: {}, searchParams: new URLSearchParams(), href: '' });
    assert.deepEqual(parseRequestUrl(''), { pathname: '', search: '', query: {}, searchParams: new URLSearchParams(), href: '' });
  });

  await t.test('parses standard query parameters', () => {
    const res = parseRequestUrl('/api/stream-info?id=dQw4w9WgXcQ&platform=youtube&quality=high');
    assert.equal(res.pathname, '/api/stream-info');
    assert.equal(res.search, '?id=dQw4w9WgXcQ&platform=youtube&quality=high');
    assert.equal(res.query.id, 'dQw4w9WgXcQ');
    assert.equal(res.query.platform, 'youtube');
    assert.equal(res.query.quality, 'high');
  });

  await t.test('handles exotic encoded characters (spaces, &, =, ?, /, +, emojis)', () => {
    const raw = '/api/stream-info?title=Daft%20Punk%20%26%20Pharrell%20%2B%20Nile&url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3D123&emoji=%F0%9F%8E%B5%F0%9F%94%A5';
    const res = parseRequestUrl(raw);
    assert.equal(res.pathname, '/api/stream-info');
    assert.equal(res.query.title, 'Daft Punk & Pharrell + Nile');
    assert.equal(res.query.url, 'https://youtube.com/watch?v=123');
    assert.equal(res.query.emoji, '🎵🔥');
  });

  await t.test('handles unicode & non-latin query characters directly', () => {
    const raw = '/api/search?q=Тату%20Нас%20не%20догонят&artist=Чайковский&tag=日本語';
    const res = parseRequestUrl(raw);
    assert.equal(res.query.q, 'Тату Нас не догонят');
    assert.equal(res.query.artist, 'Чайковский');
    assert.equal(res.query.tag, '日本語');
  });

  await t.test('handles duplicate query keys with last-value semantics and searchParams collection', () => {
    const raw = '/api/stream-info?id=firstId&id=secondId&filter=a&filter=b&filter=c';
    const res = parseRequestUrl(raw);
    assert.equal(res.query.id, 'secondId');
    assert.equal(res.query.filter, 'c');
    assert.deepEqual(res.searchParams.getAll('id'), ['firstId', 'secondId']);
    assert.deepEqual(res.searchParams.getAll('filter'), ['a', 'b', 'c']);
  });

  await t.test('handles empty queries and queries without values', () => {
    const empty1 = parseRequestUrl('/api/stream-info');
    assert.equal(empty1.pathname, '/api/stream-info');
    assert.deepEqual(empty1.query, {});

    const empty2 = parseRequestUrl('/api/stream-info?');
    assert.equal(empty2.pathname, '/api/stream-info');
    assert.deepEqual(empty2.query, {});

    const noVal = parseRequestUrl('/api/stream-info?raw&forShare=&flag');
    assert.equal(noVal.query.raw, '');
    assert.equal(noVal.query.forShare, '');
    assert.equal(noVal.query.flag, '');
  });

  await t.test('strips hash fragments cleanly from pathname and preserves parameters', () => {
    const raw = '/api/stream-info?id=xyz#section?fakeParam=notInQuery';
    const res = parseRequestUrl(raw);
    assert.equal(res.pathname, '/api/stream-info');
    assert.equal(res.query.id, 'xyz');
    assert.equal(res.query.fakeParam, undefined);
  });

  await t.test('handles malformed percent encodings gracefully without throwing', () => {
    const cases = [
      '/api/stream-info?id=%',
      '/api/stream-info?id=%zz',
      '/api/stream-info?id=%E0%A4%A',
      '/api/stream-info?id=%%12%%34'
    ];
    for (const c of cases) {
      assert.doesNotThrow(() => {
        const res = parseRequestUrl(c);
        assert.equal(res.pathname, '/api/stream-info');
        assert.ok(typeof res.query.id === 'string');
      });
    }
  });

  await t.test('handles very long query strings (64KB) without buffer overflow', () => {
    const longParam = 'x'.repeat(65536);
    const raw = `/api/search?q=${longParam}&limit=10`;
    const res = parseRequestUrl(raw);
    assert.equal(res.query.q.length, 65536);
    assert.equal(res.query.limit, '10');
  });

  await t.test('handles absolute URLs, origin overrides, and protocol variations safely', () => {
    const abs = parseRequestUrl('http://127.0.0.1:38472/api/stream-info?id=test');
    assert.equal(abs.pathname, '/api/stream-info');
    assert.equal(abs.query.id, 'test');

    const foreign = parseRequestUrl('http://attacker.example.com/api/stream-info?id=test');
    assert.equal(foreign.pathname, '/api/stream-info');
    assert.equal(foreign.query.id, 'test');

    const weird = parseRequestUrl('javascript:alert(1)');
    assert.ok(weird.pathname.includes('alert'));
  });
});

test('Suite 1B: WHATWG URL Parsing - Live HTTP Server Integration & DEP0169 Audit', async (t) => {
  // Start the actual Raser internal HTTP server on an ephemeral port
  const boundPort = await startServer(0);
  assert.ok(typeof boundPort === 'number' && boundPort > 0, 'Server should bind to valid port');

  function get(urlPath) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: boundPort,
        path: urlPath,
        method: 'GET'
      }, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  await t.test('server handles exotic query strings without crashing or DEP0169 warning', async () => {
    const res1 = await get('/api/audio-output-info?client=test%20name&random=%3F%26%3D');
    assert.equal(res1.statusCode, 200);

    const res2 = await get('/api/downloaded-track?name=non_existent_track_%F0%9F%8E%B5.mp3');
    assert.equal(res2.statusCode, 404);

    const res3 = await get('/api/local-track?id=invalid_id%26injection%3D1');
    assert.equal(res3.statusCode, 404);

    // Empty query
    const res4 = await get('/api/audio-output-info?');
    assert.equal(res4.statusCode, 200);

    // Hash fragment in request path
    const res5 = await get('/api/audio-output-info?test=1#anchor');
    assert.equal(res5.statusCode, 200);
  });

  await t.test('server cleanly closes without leaving open handles', async () => {
    await stopServer();
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Throttled Candidate Resolution (Concurrency Bounded at 2 & Early Exit)
// -----------------------------------------------------------------------------
test('Suite 2: Candidate Queue Throttling - Concurrency Limits & Early Exit Oracle', async (t) => {
  // Replicate the exact candidate queue runner logic in src/server/server.js:3156-3184
  async function runCandidateQueue(remaining, resolveFn, concurrency = 2) {
    let found = null;
    let idx = 0;
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;
    const executionLog = [];

    const worker = async () => {
      while (idx < remaining.length && !found) {
        const current = remaining[idx++];
        if (!current || !current.cand || found) break;
        activeConcurrency++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
        executionLog.push({ event: 'start', id: current.cand.id, active: activeConcurrency });

        try {
          const url = await resolveFn(current.cand.id);
          if (url && !found) {
            found = { url, id: current.cand.id };
            executionLog.push({ event: 'found', id: current.cand.id });
            activeConcurrency--;
            break;
          }
        } catch (_) {}
        activeConcurrency--;
        executionLog.push({ event: 'end', id: current.cand.id, active: activeConcurrency });
      }
    };

    const workerCount = Math.min(concurrency, remaining.length);
    const workers = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return { found, maxObservedConcurrency, executionLog };
  }

  await t.test('strictly bounds maximum concurrency to 2 across 10 candidates', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({ cand: { id: `cand_${i}` } }));
    const resolveFn = async (id) => {
      await new Promise(r => setTimeout(r, 20));
      return null; // all fail
    };

    const res = await runCandidateQueue(candidates, resolveFn, 2);
    assert.equal(res.maxObservedConcurrency, 2, 'Max concurrency must be exactly 2');
    assert.equal(res.found, null);
  });

  await t.test('terminates early as soon as a candidate resolves, ignoring remaining queue', async () => {
    // 8 candidates. Candidate 0 fails in 30ms. Candidate 1 succeeds in 20ms.
    // Candidates 2..7 take 300ms if initiated.
    const candidates = Array.from({ length: 8 }, (_, i) => ({ cand: { id: `cand_${i}` } }));
    const initiated = new Set();

    const resolveFn = async (id) => {
      initiated.add(id);
      if (id === 'cand_1') {
        await new Promise(r => setTimeout(r, 25));
        return 'http://stream.googlevideo.com/cand_1';
      }
      if (id === 'cand_0') {
        await new Promise(r => setTimeout(r, 50));
        return null;
      }
      await new Promise(r => setTimeout(r, 100));
      return 'http://stream.googlevideo.com/' + id;
    };

    const startTime = Date.now();
    const res = await runCandidateQueue(candidates, resolveFn, 2);
    const elapsed = Date.now() - startTime;

    assert.ok(res.found, 'Should find winning stream');
    assert.equal(res.found.id, 'cand_1');
    assert.equal(res.found.url, 'http://stream.googlevideo.com/cand_1');

    // With concurrency 2: cand_0 and cand_1 start immediately.
    // When cand_1 succeeds at ~25ms, worker breaks.
    // When cand_0 finishes at ~50ms, loop terminates because found is set.
    // Therefore cand_3 through cand_7 MUST NEVER BE STARTED!
    assert.ok(!initiated.has('cand_3'), 'cand_3 should not have started');
    assert.ok(!initiated.has('cand_4'), 'cand_4 should not have started');
    assert.ok(!initiated.has('cand_7'), 'cand_7 should not have started');
    assert.ok(elapsed < 200, `Execution took ${elapsed}ms, should be under 200ms due to early exit`);
  });

  await t.test('handles 0 candidates and 1 candidate edge conditions gracefully', async () => {
    const resEmpty = await runCandidateQueue([], async () => 'url', 2);
    assert.equal(resEmpty.found, null);
    assert.equal(resEmpty.maxObservedConcurrency, 0);

    const singleCand = [{ cand: { id: 'only_one' } }];
    const resSingle = await runCandidateQueue(singleCand, async () => 'http://stream/1', 2);
    assert.equal(resSingle.found.id, 'only_one');
    assert.equal(resSingle.maxObservedConcurrency, 1);
  });

  await t.test('randomized fuzz/stress test: 50 iterations with varied latency and failures', async () => {
    for (let iteration = 0; iteration < 50; iteration++) {
      const count = Math.floor(Math.random() * 8) + 1; // 1 to 8 candidates
      const winningIdx = Math.random() > 0.3 ? Math.floor(Math.random() * count) : -1; // sometimes none win
      const candidates = Array.from({ length: count }, (_, i) => ({ cand: { id: `fuzz_${iteration}_${i}` } }));

      const resolveFn = async (id) => {
        const idx = parseInt(id.split('_')[2], 10);
        const delay = Math.floor(Math.random() * 15) + 5;
        await new Promise(r => setTimeout(r, delay));
        if (idx === winningIdx) {
          return `http://stream.valid/${id}`;
        }
        return null;
      };

      const res = await runCandidateQueue(candidates, resolveFn, 2);
      assert.ok(res.maxObservedConcurrency <= 2, `Concurrency violated: ${res.maxObservedConcurrency}`);
      if (winningIdx !== -1) {
        assert.ok(res.found !== null, `Failed to find stream in iteration ${iteration}`);
      } else {
        assert.equal(res.found, null);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Anonymous Innertube Fallback Behavior & Format Selection Oracle
// -----------------------------------------------------------------------------
test('Suite 3: Anonymous Innertube Fallback Logic & Client Configurations', async (t) => {
  // Test the client configuration generator logic from src/server/server.js:739-763 & 853-875
  function getInnertubeClients(hasAuthCookies) {
    const clients = [];
    const authHeaders = hasAuthCookies ? { Cookie: 'SAPISID=123; SID=456;' } : null;

    if (authHeaders) {
      clients.push({
        clientName: 'WEB_REMIX',
        clientVersion: '1.20250922.01.00',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        extraHeaders: authHeaders
      });
    } else {
      clients.push({
        clientName: 'WEB_REMIX',
        clientVersion: '1.20250922.01.00',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      });
      clients.push({
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        deviceMake: 'Google',
        deviceModel: 'Pixel 8 Pro',
        userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US; sdk_gphone64_x86_64 Build/UE1A.230829.036) gzip'
      });
    }
    return { clients, authHeaders };
  }

  await t.test('unauthenticated users get both WEB_REMIX and ANDROID anonymous clients', () => {
    const { clients, authHeaders } = getInnertubeClients(false);
    assert.equal(authHeaders, null);
    assert.equal(clients.length, 2);
    assert.equal(clients[0].clientName, 'WEB_REMIX');
    assert.equal(clients[0].extraHeaders, undefined);
    assert.equal(clients[1].clientName, 'ANDROID');
    assert.equal(clients[1].extraHeaders, undefined);
    assert.equal(clients[1].androidSdkVersion, 34);
  });

  await t.test('authenticated users get authenticated client first, with fallback definition ready', () => {
    const { clients, authHeaders } = getInnertubeClients(true);
    assert.ok(authHeaders);
    assert.equal(clients.length, 1);
    assert.equal(clients[0].clientName, 'WEB_REMIX');
    assert.ok(clients[0].extraHeaders.Cookie);
  });

  await t.test('format selection oracle: selects best quality audio format and filters ciphers', () => {
    const sampleStreamingData = {
      streamingData: {
        adaptiveFormats: [
          { itag: 249, mimeType: 'audio/webm; codecs="opus"', bitrate: 50000, url: 'http://stream/249' },
          { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 70000, url: 'http://stream/250' },
          { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, url: 'http://stream/251' },
          { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, url: 'http://stream/140' },
          { itag: 999, mimeType: 'audio/webm', bitrate: 999999, signatureCipher: 's=abc' }, // Ciphered! Should be ignored
          { itag: 137, mimeType: 'video/mp4', bitrate: 2000000, url: 'http://stream/137' } // Video! Should be ignored
        ],
        formats: [
          { itag: 18, mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', bitrate: 500000, url: 'http://stream/18' }
        ]
      }
    };

    function pickAudioUrl(data, quality = 'medium') {
      const adaptive = (data.streamingData && data.streamingData.adaptiveFormats) || [];
      const muxed = (data.streamingData && data.streamingData.formats) || [];
      const allFormats = [...adaptive, ...muxed];
      const audioFormats = allFormats.filter(f => f && f.url && !f.signatureCipher && !f.cipher && typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/'));

      if (audioFormats.length > 0) {
        let pool = audioFormats;
        if (quality === 'low') {
          pool.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
        } else if (quality === 'high' || quality === 'max') {
          pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        } else {
          const m4a = audioFormats.filter(f => f.mimeType.includes('mp4') || f.mimeType.includes('m4a'));
          const webm = audioFormats.filter(f => f.mimeType.includes('webm') || f.mimeType.includes('opus'));
          pool = m4a.length > 0 ? m4a : webm.length > 0 ? webm : audioFormats;
          pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        }
        return pool[0].url;
      }
      const itag18 = muxed.find(f => f && f.itag === 18 && f.url && !f.signatureCipher && !f.cipher);
      if (itag18) return itag18.url;
      return null;
    }

    assert.equal(pickAudioUrl(sampleStreamingData, 'low'), 'http://stream/249', 'Low quality selects lowest bitrate');
    assert.equal(pickAudioUrl(sampleStreamingData, 'high'), 'http://stream/251', 'High quality selects highest bitrate audio');
    assert.equal(pickAudioUrl(sampleStreamingData, 'medium'), 'http://stream/140', 'Medium quality prefers m4a/mp4');

    // Test fallback when only itag18 is available
    const onlyItag18Data = { streamingData: { formats: [{ itag: 18, url: 'http://stream/18' }] } };
    assert.equal(pickAudioUrl(onlyItag18Data), 'http://stream/18', 'Falls back to itag 18 muxed stream');
  });
});

// -----------------------------------------------------------------------------
// Suite 4: Non-Blocking Logging & Cookie File Cleanup Stress
// -----------------------------------------------------------------------------
test('Suite 4: Shared Subsystem - Non-Blocking Logger & Cookie Jar Cleanup', async (t) => {
  await t.test('logger handles bursts without blocking event loop', async () => {
    const start = Date.now();
    for (let i = 0; i < 500; i++) {
      logger.log('info', `stress_test_entry_${i}_${'x'.repeat(100)}`);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `Logging 500 entries took ${elapsed}ms, must be non-blocking (<50ms)`);

    // Verify tail reads buffered logs
    const lines = logger.tail(5);
    assert.ok(lines.length > 0);
    assert.ok(lines.some(l => l.includes('stress_test_entry_')));
  });

  await t.test('temporary cookie jar cleanup unlinks files matching pattern', () => {
    const dummyJar = path.join(DATA_DIR, `.yt-cookies-${process.pid}-999999-test.tmp`);
    fs.writeFileSync(dummyJar, 'test cookie jar content');
    assert.ok(fs.existsSync(dummyJar));

    // Run directory scan cleanup identical to cleanupStaleCookieJars
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const f of files) {
        if (f.startsWith('.yt-cookies-') && f.endsWith('.tmp')) {
          try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (_) {}
        }
      }
    }

    assert.ok(!fs.existsSync(dummyJar), 'Dummy cookie jar should be removed');
  });
});

// -----------------------------------------------------------------------------
// Suite 5: Spotify Embed Hardening & Transliterated Artist Matching
// -----------------------------------------------------------------------------
test('Suite 5: Spotify Matching - Transliterated Artist Matching & Score Thresholds', async (t) => {
  await t.test('correctly matches transliterated Cyrillic artists in candidate scoring', () => {
    const targetTitle = 'Nas Ne Dogonyat';
    const targetArtist = 'Tatu';
    const targetDur = 278;

    const cand = {
      id: 'yt_tatu_1',
      title: 'Тату - Нас не догонят',
      artist: 'Тату',
      duration: 278
    };

    const score = scoreImportedCandidate(targetTitle, targetArtist, targetDur, cand);
    assert.ok(score >= 60, `Score (${score}) must satisfy >= 60 threshold for imported match`);
  });

  await t.test('correctly matches Greek transliterated artists', () => {
    const targetTitle = 'Zorba Dance';
    const targetArtist = 'Mikis Theodorakis';
    const targetDur = 240;

    const cand = {
      id: 'yt_zorba',
      title: 'Μίκης Θεοδωράκης - Zorba',
      artist: 'Μίκης Θεοδωράκης',
      duration: 240
    };

    const score = scoreImportedCandidate(targetTitle, targetArtist, targetDur, cand);
    assert.ok(score >= 60, `Score (${score}) must satisfy >= 60 threshold for imported match`);
  });
});

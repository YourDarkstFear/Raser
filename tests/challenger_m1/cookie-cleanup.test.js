'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

function post(port, route, token, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Riff-Token': token,
        'Connection': 'close'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch (_) { json = body; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

test('Temporary cookie jar cleanup: normal exit, failure exit, timeout kill, and stale sweep', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-cookie-test-'));
  const oldDataDir = process.env.RASER_DATA_DIR;
  process.env.RASER_DATA_DIR = tempDir;

  const oldPath = process.env.PATH;
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  try {
    // 1. Create a mock yt-cookies.txt with a valid YouTube login cookie
    const cookiesFile = path.join(tempDir, 'yt-cookies.txt');
    const validCookieData = [
      '# Netscape HTTP Cookie File',
      '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\tAFmmF2swRQIhAK8test:mocklogin',
      '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSAPISID\t1234567890abcdef',
      '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tsid_mock_value_here'
    ].join('\n');
    fs.writeFileSync(cookiesFile, validCookieData, 'utf8');

    // 2. Create fake yt-dlp binary
    const fakeYtDlp = path.join(binDir, 'yt-dlp');
    const fakeScript = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "2024.10.07"
  exit 0
fi
if echo "$@" | grep -q "FAIL_MODE"; then
  echo "Simulated yt-dlp error" >&2
  exit 1
fi
if echo "$@" | grep -q "HANG_MODE"; then
  sleep 2
  exit 0
fi
echo "https://googlevideo.com/videoplayback?id=mock"
exit 0
`;
    fs.writeFileSync(fakeYtDlp, fakeScript, { mode: 0o755 });
    process.env.PATH = `${binDir}:${oldPath}`;

    delete require.cache[require.resolve('../../src/server/server')];
    delete require.cache[require.resolve('../../src/shared/platform')];
    const server = require('../../src/server/server');

    const countTempCookieFiles = () => {
      if (!fs.existsSync(tempDir)) return 0;
      return fs.readdirSync(tempDir).filter(f => f.startsWith('.yt-cookies-') && f.endsWith('.tmp')).length;
    };

    assert.strictEqual(countTempCookieFiles(), 0, 'Initially no temp cookie jars should exist');

    const port = await server.startServer(0);
    const token = server.getServerToken();

    // --- Scenario 1: Normal execution (exit code 0) ---
    // /api/proxy-test directly invokes executeYtDlp
    const resNormal = await post(port, '/api/proxy-test', token, { proxyUrl: 'NORMAL_FLOW' });
    assert.strictEqual(resNormal.status, 200);
    assert.strictEqual(resNormal.data.success, true);
    assert.strictEqual(countTempCookieFiles(), 0, 'Temp cookie file must be unlinked after normal execution');

    // --- Scenario 2: Error exit (exit code 1) ---
    const resFail = await post(port, '/api/proxy-test', token, { proxyUrl: 'FAIL_MODE' });
    assert.strictEqual(resFail.status, 200);
    assert.strictEqual(resFail.data.success, false);
    assert.strictEqual(countTempCookieFiles(), 0, 'Temp cookie file must be unlinked after child process error');

    // --- Scenario 3: Stale orphaned cookie jar recovery on server start/stop ---
    const stale1 = path.join(tempDir, '.yt-cookies-1111-stale1.tmp');
    const stale2 = path.join(tempDir, '.yt-cookies-2222-stale2.tmp');
    fs.writeFileSync(stale1, 'stale cookies 1');
    fs.writeFileSync(stale2, 'stale cookies 2');
    assert.strictEqual(countTempCookieFiles(), 2, '2 orphaned files planted');

    // Stop and restart server
    await server.stopServer();
    assert.strictEqual(countTempCookieFiles(), 0, 'stopServer() must clean up all stale cookie files');

    // Plant again before startServer
    fs.writeFileSync(stale1, 'stale cookies 1');
    assert.strictEqual(countTempCookieFiles(), 1);
    await server.startServer(0);
    assert.strictEqual(countTempCookieFiles(), 0, 'startServer() must sweep and clean up stale cookie files');

    await server.stopServer();

    // --- Scenario 4: Process exit hook cleanup ---
    const exitTestScript = `
      process.env.RASER_DATA_DIR = ${JSON.stringify(tempDir)};
      process.env.PATH = ${JSON.stringify(binDir + ':' + oldPath)};
      const fs = require('fs');
      const path = require('path');
      const server = require(${JSON.stringify(require.resolve('../../src/server/server'))});
      
      // Plant an active temp jar file directly
      const tempJar = path.join(${JSON.stringify(tempDir)}, '.yt-cookies-' + process.pid + '-test.tmp');
      fs.writeFileSync(tempJar, 'active cookie');
      
      // Stop server and exit
      server.stopServer().then(() => {
        process.exit(0);
      });
    `;
    const exitProc = spawnSync(process.execPath, ['-e', exitTestScript], { encoding: 'utf8' });
    assert.strictEqual(exitProc.status, 0);
    assert.strictEqual(countTempCookieFiles(), 0, 'Orphaned cookie jars must be swept on process exit');

  } finally {
    process.env.PATH = oldPath;
    if (oldDataDir === undefined) delete process.env.RASER_DATA_DIR;
    else process.env.RASER_DATA_DIR = oldDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

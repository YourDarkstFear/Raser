const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Target module
const {
  pruneDiskCache,
  getMaxCacheLimit,
  writeAtomicJsonAsync,
  saveTrackMetadata,
  saveLibraryIndex
} = require('../../src/server/server');

test('Challenger M2 - Cache LRU Eviction & Async Atomic Persistence Stress Suite', async (t) => {
  await t.test('pruneDiskCache evicts oldest tracks in strict LRU order down to 80% watermark', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-challenger-lru-'));
    try {
      const NUM_TRACKS = 30;
      const CHUNK_SIZE = 50 * 1024; // 50 KB per track
      const chunk = Buffer.alloc(CHUNK_SIZE, 0x5a);

      const nowSec = Math.floor(Date.now() / 1000);
      const files = [];

      // Create 30 tracks with staggered mtime/atime: track_0 is oldest, track_29 is newest
      for (let i = 0; i < NUM_TRACKS; i++) {
        const ext = ['.m4a', '.webm', '.mp3', '.opus', '.ogg', '.flac'][i % 6];
        const fileName = `track_${String(i).padStart(2, '0')}${ext}`;
        const filePath = path.join(testDir, fileName);
        fs.writeFileSync(filePath, chunk);

        // Stagger time: i = 0 is 3000s ago, i = 29 is 100s ago
        const timeSec = nowSec - (NUM_TRACKS - i) * 100;
        fs.utimesSync(filePath, timeSec, timeSec);
        files.push({ name: fileName, path: filePath, index: i });
      }

      // Total size = 30 * 50 KB = 1500 KB
      // Quota = 1000 KB. 80% watermark = 800 KB.
      // Must evict down to <= 800 KB, which means keeping <= 16 tracks (16 * 50 KB = 800 KB).
      // So tracks 0 to 13 (14 tracks = 700 KB) must be unlinked, leaving 16 tracks (800 KB).
      const quotaBytes = 1000 * 1024;
      const watermarkBytes = Math.floor(quotaBytes * 0.8);

      const res = await pruneDiskCache(quotaBytes, testDir);
      assert.ok(res, 'pruneDiskCache must return a result object');
      assert.ok(res.totalBytes <= watermarkBytes, `Remaining bytes ${res.totalBytes} must be <= 80% watermark (${watermarkBytes})`);

      // Verify that all unlinked files are the oldest ones (lowest indices)
      // and all surviving files are the newest ones (highest indices)
      let firstSurvivingIndex = -1;
      for (let i = 0; i < NUM_TRACKS; i++) {
        const exists = fs.existsSync(files[i].path);
        if (exists && firstSurvivingIndex === -1) {
          firstSurvivingIndex = i;
        }
        if (firstSurvivingIndex !== -1) {
          assert.ok(exists, `Track ${files[i].name} (index ${i}) should survive because newer than index ${firstSurvivingIndex}`);
        } else {
          assert.ok(!exists, `Track ${files[i].name} (index ${i}) should have been evicted by LRU`);
        }
      }

      assert.ok(firstSurvivingIndex > 0, 'At least one oldest file must have been evicted');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('pruneDiskCache unlinks stale temp files (>10m) and tiny files (<1KB) but preserves fresh temp files', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-challenger-temps-'));
    try {
      const nowSec = Math.floor(Date.now() / 1000);

      // Stale temp file: 20 minutes old
      const staleTemp = path.join(testDir, 'stream.temp.old.m4a');
      fs.writeFileSync(staleTemp, Buffer.alloc(10 * 1024, 0x11));
      fs.utimesSync(staleTemp, nowSec - 1200, nowSec - 1200);

      // Fresh temp file: 2 minutes old
      const freshTemp = path.join(testDir, 'stream.temp.recent.m4a');
      fs.writeFileSync(freshTemp, Buffer.alloc(10 * 1024, 0x22));
      fs.utimesSync(freshTemp, nowSec - 120, nowSec - 120);

      // Tiny corrupted junk file (< 1000 bytes)
      const tinyJunk = path.join(testDir, 'corrupt.mp3');
      fs.writeFileSync(tinyJunk, Buffer.alloc(512, 0x00));
      fs.utimesSync(tinyJunk, nowSec, nowSec);

      // Valid audio file
      const validAudio = path.join(testDir, 'good.opus');
      fs.writeFileSync(validAudio, Buffer.alloc(50 * 1024, 0x33));
      fs.utimesSync(validAudio, nowSec, nowSec);

      // Non-audio file (> 1KB)
      const noteFile = path.join(testDir, 'readme.txt');
      fs.writeFileSync(noteFile, Buffer.alloc(2000, 0x44));

      // Generous quota so no audio tracks need eviction
      await pruneDiskCache(10 * 1024 * 1024, testDir);

      assert.ok(!fs.existsSync(staleTemp), 'Stale temp file (>10m) must be deleted');
      assert.ok(fs.existsSync(freshTemp), 'Fresh temp file (<10m) must be preserved for active downloads');
      assert.ok(!fs.existsSync(tinyJunk), 'Corrupt sub-1KB junk file must be unlinked');
      assert.ok(fs.existsSync(validAudio), 'Valid audio track must be retained');
      assert.ok(fs.existsSync(noteFile), 'Non-audio file must not be modified');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('writeAtomicJsonAsync concurrency stress: 20 parallel writes result in uncorrupted valid JSON', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-challenger-atomic-'));
    const targetFile = path.join(testDir, 'stress-index.json');

    try {
      const PARALLEL_WRITES = 20;
      const promises = [];

      for (let i = 0; i < PARALLEL_WRITES; i++) {
        const payload = {
          writerId: i,
          timestamp: Date.now(),
          entries: Array.from({ length: 50 }, (_, idx) => ({
            id: `track_${i}_${idx}`,
            title: `Title ${i}-${idx}`,
            lastPlayed: Date.now() + idx
          }))
        };
        promises.push(writeAtomicJsonAsync(targetFile, payload));
      }

      // Wait for all concurrent writes to settle
      await Promise.all(promises);

      // Target file must exist and be completely valid JSON
      assert.ok(fs.existsSync(targetFile), 'Target file must exist after concurrent writes');
      const content = fs.readFileSync(targetFile, 'utf-8');
      let parsed = null;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(content);
      }, 'Resulting JSON must be valid and uncorrupted');

      assert.ok(parsed && typeof parsed.writerId === 'number', 'Payload structure intact');
      assert.equal(parsed.entries.length, 50, 'All 50 entries in winning write preserved');

      // Check directory for lingering .tmp files
      const remainingFiles = fs.readdirSync(testDir);
      const tmpFiles = remainingFiles.filter(f => f.endsWith('.tmp'));
      assert.equal(tmpFiles.length, 0, 'All temporary files must be cleaned up without leaks');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('pruneDiskCache boundary conditions: empty dir, non-existent dir, and invalid quotas', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-challenger-empty-'));
    try {
      // Empty directory
      const resEmpty = await pruneDiskCache(1024 * 1024, emptyDir);
      assert.ok(resEmpty);
      assert.equal(resEmpty.totalBytes, 0);
      assert.equal(resEmpty.candidateCount, 0);

      // Non-existent directory: returns null without crashing
      const missingDir = path.join(emptyDir, 'does-not-exist');
      const resMissing = await pruneDiskCache(1024 * 1024, missingDir);
      assert.equal(resMissing, null);

      // Invalid quota (negative, zero, string): falls back to default limit (>= 1 GB)
      const resDefault = await pruneDiskCache(-500, emptyDir);
      assert.ok(resDefault);
      assert.ok(resDefault.maxBytes >= 1024 * 1024 * 1024);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

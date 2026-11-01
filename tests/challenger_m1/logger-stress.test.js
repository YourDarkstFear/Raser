'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('Logger stress harness: non-blocking buffering, async flush, sync tail, and exit drain', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-logger-stress-'));
  const oldDataDir = process.env.RASER_DATA_DIR;
  process.env.RASER_DATA_DIR = tempDir;

  try {
    // Clear require cache to ensure fresh instance using tempDir
    delete require.cache[require.resolve('../../src/shared/logger')];
    delete require.cache[require.resolve('../../src/shared/platform')];
    const logger = require('../../src/shared/logger');

    const logFile = path.join(logger.LOG_DIR, 'raser.log');

    // --- Check 1: Non-blocking performance of rapid logging burst ---
    const BURST_COUNT = 5000;
    const startBurst = performance.now();
    for (let i = 0; i < BURST_COUNT; i++) {
      logger.log('info', `burst_msg_${i.toString().padStart(5, '0')}`);
    }
    const burstDurationMs = performance.now() - startBurst;

    // In-memory queue push should be sub-50ms for 5,000 items
    assert.ok(burstDurationMs < 100, `Burst logging took too long (${burstDurationMs.toFixed(2)}ms), event loop was blocked!`);

    // Wait for setImmediate async flush to write queue to disk
    await new Promise(r => setTimeout(r, 200));

    assert.ok(fs.existsSync(logFile), 'Log file should exist after async flush');
    const contentAfterBurst = fs.readFileSync(logFile, 'utf8');
    const linesAfterBurst = contentAfterBurst.trim().split('\n').filter(Boolean);
    assert.strictEqual(linesAfterBurst.length, BURST_COUNT, `Expected ${BURST_COUNT} lines in log file, got ${linesAfterBurst.length}`);

    // --- Check 2: Immediate synchronous drain on tail() ---
    const tailMarker = 'TAIL_SYNC_VERIFICATION_MARKER_99999';
    logger.log('warn', tailMarker);

    // Call tail() IMMEDIATELY without waiting for async tick
    const tailLines = logger.tail(5);
    assert.ok(tailLines.length > 0, 'tail() should return lines');
    const lastTailLine = tailLines[tailLines.length - 1];
    assert.ok(lastTailLine.includes(tailMarker), `tail() did not immediately flush and return newest log. Got: ${lastTailLine}`);

    // Verify disk content also contains the marker immediately
    const diskContent = fs.readFileSync(logFile, 'utf8');
    assert.ok(diskContent.includes(tailMarker), 'Log file should contain tail marker synchronously');

    // --- Check 3: Synchronous drain on process.exit ---
    // Spawn an isolated node subprocess that logs and immediately exits
    const childScript = `
      process.env.RASER_DATA_DIR = ${JSON.stringify(tempDir)};
      const logger = require(${JSON.stringify(require.resolve('../../src/shared/logger'))});
      for (let i = 0; i < 200; i++) {
        logger.log('info', 'exit_drain_' + i);
      }
      process.exit(0);
    `;
    const childProc = spawnSync(process.execPath, ['-e', childScript], { encoding: 'utf8' });
    assert.strictEqual(childProc.status, 0, 'Child process should exit with 0');

    const contentAfterChild = fs.readFileSync(logFile, 'utf8');
    for (let i = 0; i < 200; i++) {
      assert.ok(contentAfterChild.includes(`exit_drain_${i}`), `Log file missing exit_drain_${i} after synchronous exit!`);
    }

    // --- Check 4: Maximum message length truncation (800 chars) ---
    const oversizedMsg = 'X'.repeat(2000);
    logger.log('error', oversizedMsg);
    logger.tail(1); // sync flush
    const linesAfterTrunc = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    const lastLine = linesAfterTrunc[linesAfterTrunc.length - 1];
    // Formatted: ISO_DATE (24) + " [error] " (9) + msg (<=800) = <= 833
    assert.ok(lastLine.length <= 850, `Logged line was not truncated: length was ${lastLine.length}`);
    assert.ok(!lastLine.includes('X'.repeat(805)), 'Oversized message was not truncated to 800 chars');

    // --- Check 5: Log rotation under high volume (> 1MB) ---
    const BIG_BURST = 4000;
    const padding = 'A'.repeat(400); // 400 bytes * 4000 = ~1.6MB
    for (let i = 0; i < BIG_BURST; i++) {
      logger.log('info', `rot_${i}_${padding}`);
    }
    logger.tail(1); // Flush initial big burst (file becomes > 1MB)

    // Trigger next write so rotate() detects size > 1MB and rotates
    logger.log('info', 'post_rotation_trigger_entry');
    logger.tail(1);

    const rotatedLogFile = `${logFile}.1`;
    assert.ok(fs.existsSync(rotatedLogFile), 'Rotated log file (raser.log.1) should exist when size exceeds 1MB');
    const rotatedStat = fs.statSync(rotatedLogFile);
    assert.ok(rotatedStat.size >= 1024 * 1024, `Rotated log file should be >= 1MB, got ${rotatedStat.size}`);

    const newLogStat = fs.statSync(logFile);
    assert.ok(newLogStat.size < 1000, `New active log file should be small after rotation, got ${newLogStat.size}`);
    const activeContent = fs.readFileSync(logFile, 'utf8');
    assert.ok(activeContent.includes('post_rotation_trigger_entry'), 'New log file should contain post-rotation entry');

  } finally {
    if (oldDataDir === undefined) delete process.env.RASER_DATA_DIR;
    else process.env.RASER_DATA_DIR = oldDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

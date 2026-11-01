const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./platform');

const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'raser.log');
const LEGACY_LOG_PATH = path.join(LOG_DIR, 'riff.log');
const MAX_BYTES = 1024 * 1024;

let dirEnsured = false;
let queue = [];
let flushing = false;
let flushScheduled = false;

function rotate() {
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
  } catch (e) {}
}

async function asyncRotate() {
  try {
    const stat = await fs.promises.stat(LOG_PATH).catch(() => null);
    if (stat && stat.size > MAX_BYTES) {
      await fs.promises.rename(LOG_PATH, `${LOG_PATH}.1`).catch(() => {});
    }
  } catch (_) {}
}

function flushSync() {
  if (queue.length === 0) return;
  try {
    const batch = queue.splice(0, queue.length).join('');
    if (!dirEnsured) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      dirEnsured = true;
    }
    rotate();
    fs.appendFileSync(LOG_PATH, batch, 'utf8');
  } catch (_) {}
}

async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.splice(0, queue.length).join('');
    if (batch) {
      if (!dirEnsured) {
        await fs.promises.mkdir(LOG_DIR, { recursive: true }).catch(() => {});
        dirEnsured = true;
      }
      await asyncRotate();
      await fs.promises.appendFile(LOG_PATH, batch, 'utf8').catch(() => {});
    }
  } catch (_) {
  } finally {
    flushing = false;
    if (queue.length > 0) {
      setImmediate(flush);
    }
  }
}

function scheduleFlush() {
  if (flushScheduled || flushing) return;
  flushScheduled = true;
  setImmediate(() => {
    flushScheduled = false;
    flush();
  });
}

function log(level, message) {
  try {
    const entry = `${new Date().toISOString()} [${level}] ${String(message).slice(0, 800)}\n`;
    queue.push(entry);
    scheduleFlush();
  } catch (_) {}
}

function tail(lines) {
  try {
    flushSync();
    const file = fs.existsSync(LOG_PATH) ? LOG_PATH : LEGACY_LOG_PATH;
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-lines);
  } catch (e) {
    return [];
  }
}

process.once('exit', flushSync);

module.exports = { log, tail, LOG_DIR };

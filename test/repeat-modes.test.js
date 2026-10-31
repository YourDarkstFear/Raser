'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('repeat mode supports 3 states: off, all, and one', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

  // Verify repeatMode is declared with 3 states
  assert.ok(appJs.includes("repeatMode:"), 'app.js should declare repeatMode in state');
  assert.ok(appJs.includes("cycleRepeatMode"), 'app.js should define cycleRepeatMode function');

  // Verify transition cycle: off -> all -> one -> off
  assert.ok(appJs.includes("if (current === 'off') next = 'all';"), 'cycleRepeatMode should transition off -> all');
  assert.ok(appJs.includes("else if (current === 'all') next = 'one';"), 'cycleRepeatMode should transition all -> one');
  assert.ok(appJs.includes("else if (current === 'one') next = 'off';"), 'cycleRepeatMode should transition one -> off');

  // Verify single-track repeat behavior
  assert.ok(appJs.includes("if (state.repeatMode === 'one')"), 'track ending should check repeatMode === one');

  // Verify repeat-all queue wrapping behavior
  assert.ok(appJs.includes("if (state.repeatMode === 'all')"), 'playNext should check repeatMode === all to loop queue');
});

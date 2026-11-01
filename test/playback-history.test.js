'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('shuffle and playback history tracking integrity', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

  // Verify state initialization
  assert.ok(appJs.includes('playHistory: [],'), 'state should initialize playHistory');
  assert.ok(appJs.includes('futureHistory: [],'), 'state should initialize futureHistory');

  // Verify pushPlayHistory uses isSameTrack instead of raw id comparison
  assert.ok(appJs.includes('if (h.length && isSameTrack(h[h.length - 1], track)) return;'), 'pushPlayHistory should compare tracks canonically');

  // Verify playTrack pushes to playHistory and clears futureHistory when not navigating
  assert.ok(appJs.includes('if (state.currentTrack && !isSameTrack(state.currentTrack, track) && !navigatingHistory && !navigatingBack)'), 'playTrack should push previous track to playHistory');
  assert.ok(appJs.includes('if (!navigatingHistory && !navigatingBack) {\n      state.futureHistory = [];\n    }'), 'playTrack should clear forward history on fresh track select');

  // Verify playNext consumes futureHistory first
  assert.ok(appJs.includes('const fh = state.futureHistory || (state.futureHistory = []);\n    if (fh.length > 0) {'), 'playNext should consume futureHistory first');

  // Verify playPrev checks playHistory and in shuffle mode does not jump to arbitrary queue items
  assert.ok(appJs.includes('if (state.isShuffle) {\n      if (el.nativeAudio) el.nativeAudio.currentTime = 0;\n      return;\n    }'), 'playPrev should not jump to arbitrary queue index when shuffle is on and history is empty');

  // Verify playPrev pushes current track to futureHistory for redo
  assert.ok(appJs.includes('state.futureHistory.push(state.currentTrack);'), 'playPrev should push current track to futureHistory for forward navigation');
});

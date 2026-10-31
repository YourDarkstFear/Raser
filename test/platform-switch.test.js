'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('setPlatform only triggers search if discover search results are active', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

  // Verify that isSearchActive checks currentView === 'discover'
  assert.ok(
    appJs.includes("state.currentView === 'discover'"),
    'setPlatform must verify that currentView is discover before triggering search'
  );
  assert.ok(
    appJs.includes("!el.searchResultsContainer.classList.contains('hidden')"),
    'setPlatform must verify that searchResultsContainer is not hidden before triggering search'
  );
});

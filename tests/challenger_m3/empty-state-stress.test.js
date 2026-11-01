const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'index.html');
const APP_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');

const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');
const appContent = fs.readFileSync(APP_PATH, 'utf-8');

// Lightweight DOM mock for testing renderTracks in Node
class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new Set(className ? className.split(/\s+/) : []);
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    // Basic parser for child elements with classes
    const tagMatches = html.matchAll(/<([a-z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-z0-9]+)([^>]*)\/>/gi);
    for (const match of tagMatches) {
      const tag = match[1] || match[4];
      const attrs = match[2] || match[5] || '';
      const content = match[3] || '';
      const classMatch = attrs.match(/class=["']([^"']+)["']/i);
      const idMatch = attrs.match(/id=["']([^"']+)["']/i);
      const child = new MockElement(tag, idMatch ? idMatch[1] : '', classMatch ? classMatch[1] : '');
      child.textContent = content.replace(/<[^>]+>/g, '').trim();
      child._innerHTML = content;
      this.appendChild(child);
    }
  }

  get textContent() {
    return this._innerHTML.replace(/<[^>]+>/g, '').trim();
  }

  set textContent(txt) {
    this._innerHTML = txt;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      let match = true;
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        match = node.classList.has(cls);
      } else if (selector.startsWith('#')) {
        const id = selector.slice(1);
        match = node.id === id;
      }
      if (match && node !== this) results.push(node);
      for (const ch of node.children) check(ch);
    };
    check(this);
    return results;
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 };
  }
}

// Extract renderTracks implementation from app.js
function buildRenderTracks() {
  const snippetMatch = appContent.match(/function renderTracks\(container, tracks, context = 'search'\) \{([\s\S]*?)\n    const itemHeight = 64;/);
  if (!snippetMatch) {
    throw new Error('Failed to extract renderTracks header from app.js');
  }
  const body = snippetMatch[1];
  return new Function('container', 'tracks', 'context', body);
}

test('Challenger M3 - Empty State Cards Across Views Stress Suite', async (t) => {
  await t.test('index.html static track lists contain empty-state-card structure on boot', () => {
    // favorites, history, queue
    const expectedViews = ['favorites', 'history', 'queue'];
    for (const view of expectedViews) {
      const regex = new RegExp(`<div class="tracks-list" id="${view}-tracks-list">[\\s\\S]*?<div class="empty-hint empty-state-card">[\\s\\S]*?<div class="empty-state-badge">[\\s\\S]*?<svg[\\s\\S]*?<div class="empty-state-title">([\\s\\S]*?)<\\/div>[\\s\\S]*?<div class="empty-state-sub">([\\s\\S]*?)<\\/div>`);
      const match = htmlContent.match(regex);
      assert.ok(match, `View #${view}-tracks-list must contain complete empty-state-card in index.html`);
      assert.ok(match[1].trim().length > 0, `View #${view} empty-state-title must not be empty`);
      assert.ok(match[2].trim().length > 0, `View #${view} empty-state-sub must not be empty`);
    }
  });

  await t.test('renderTracks renders distinct contextual empty cards for all 6 supported contexts', () => {
    const renderTracks = buildRenderTracks();
    const contexts = [
      { id: 'search', title: 'No matching tracks found', badgeSnippet: 'circle cx="11"' },
      { id: 'favorites', title: 'No favorite tracks yet', badgeSnippet: 'path d="M19 14' },
      { id: 'playlist', title: 'This playlist is empty', badgeSnippet: 'path d="M9 18V5l12-2v13"' },
      { id: 'queue', title: 'Playback queue is empty', badgeSnippet: 'stroke-linecap="round"' },
      { id: 'history', title: 'No recently played tracks', badgeSnippet: 'circle cx="12" cy="12" r="9"' },
      { id: 'local', title: 'Your local library is empty', badgeSnippet: 'path d="M22 19a2 2' }
    ];

    global.document = {
      querySelector: (sel) => sel === '.main-content' ? new MockElement('div', '', 'main-content') : null
    };

    for (const ctx of contexts) {
      const container = new MockElement('div', `${ctx.id}-list`, 'tracks-list');
      container.style.paddingTop = '120px';
      container.style.paddingBottom = '340px';

      renderTracks(container, [], ctx.id);

      assert.equal(container.style.paddingTop, '0px', `paddingTop must reset to 0px for empty ${ctx.id}`);
      assert.equal(container.style.paddingBottom, '0px', `paddingBottom must reset to 0px for empty ${ctx.id}`);
      assert.ok(container.innerHTML.includes('empty-hint empty-state-card'), `Must have empty-hint and empty-state-card classes`);
      assert.ok(container.innerHTML.includes(ctx.title), `Must display correct title "${ctx.title}"`);
      assert.ok(container.innerHTML.includes(ctx.badgeSnippet), `Must include matching SVG badge for ${ctx.id}`);
    }
  });

  await t.test('renderTracks handles unknown context with fallback card', () => {
    const renderTracks = buildRenderTracks();
    const container = new MockElement('div');
    renderTracks(container, [], 'arbitrary_future_view');

    assert.ok(container.innerHTML.includes('No tracks to show'), 'Fallback title must be "No tracks to show"');
    assert.ok(container.innerHTML.includes('empty-state-badge'), 'Fallback card must have badge');
    assert.equal(container.style.paddingTop, '0px');
    assert.equal(container.style.paddingBottom, '0px');
  });

  await t.test('renderTracks handles falsy track list variations (null, undefined, [])', () => {
    const renderTracks = buildRenderTracks();
    const falsyCases = [null, undefined, []];

    for (const c of falsyCases) {
      const container = new MockElement('div');
      renderTracks(container, c, 'search');
      assert.ok(container.innerHTML.includes('No matching tracks found'), `Falsy case ${c} must render empty card`);
    }

    // Null container must no-op without error
    assert.doesNotThrow(() => renderTracks(null, [], 'search'));
  });

  await t.test('detaches previous virtual scroll listener when rendering empty list', () => {
    const renderTracks = buildRenderTracks();
    let removedListener = null;

    const mockScrollParent = {
      removeEventListener: (evt, handler) => {
        if (evt === 'scroll') removedListener = handler;
      }
    };
    global.document = {
      querySelector: (sel) => sel === '.main-content' ? mockScrollParent : null
    };

    const dummyHandler = () => {};
    const container = new MockElement('div');
    container._vScrollHandler = dummyHandler;

    renderTracks(container, [], 'favorites');
    assert.equal(removedListener, dummyHandler, 'Virtual scroll handler must be cleanly removed on empty list');
  });

  await t.test('stress harness: 2,000 rapid empty state render cycles without corruption or leaks', () => {
    const renderTracks = buildRenderTracks();
    const contexts = ['search', 'favorites', 'playlist', 'queue', 'history', 'local', 'unknown'];
    const container = new MockElement('div');

    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) {
      const ctx = contexts[i % contexts.length];
      renderTracks(container, [], ctx);
      assert.ok(container.innerHTML.length > 50, `Render at iteration ${i} must produce valid HTML`);
    }
    const durationMs = performance.now() - t0;
    assert.ok(durationMs < 500, `2000 render cycles took ${durationMs.toFixed(2)}ms (expected < 500ms)`);
  });
});

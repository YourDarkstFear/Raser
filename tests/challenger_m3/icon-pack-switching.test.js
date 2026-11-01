const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const APP_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'app.js');
const appContent = fs.readFileSync(APP_PATH, 'utf-8');

// Lightweight DOM mock for testing icon pack transitions
class MockDOMNode {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _set: new Set(className ? className.split(/\s+/) : []),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      toggle: (c, force) => {
        if (force === true) this.classList._set.add(c);
        else if (force === false) this.classList._set.delete(c);
        else if (this.classList._set.has(c)) this.classList._set.delete(c);
        else this.classList._set.add(c);
      },
      contains: (c) => this.classList._set.has(c)
    };
    this.attributes = new Map();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.textContent = '';
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) {
        this.parentNode.children.splice(idx, 1);
      }
      this.parentNode = null;
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      let match = false;
      if (selector === '#nav-home-app-icon' && node.id === 'nav-home-app-icon') match = true;
      else if (selector === 'svg.nav-discover-pack-svg' && node.tagName === 'SVG' && node.classList.contains('nav-discover-pack-svg')) match = true;
      else if (selector === '.nav-indicator' && node.classList.contains('nav-indicator')) match = true;
      else if (selector === '.m3-dropdown-option' && node.classList.contains('m3-dropdown-option')) match = true;
      else if (selector.startsWith('#') && node.id === selector.slice(1)) match = true;
      else if (selector.includes(' ') && selector.endsWith('svg') && node.tagName === 'SVG') {
        const parentId = selector.split(' ')[0].replace('#', '');
        if (node.parentNode && (node.parentNode.id === parentId || (node.parentNode.parentNode && node.parentNode.parentNode.id === parentId))) {
          match = true;
        }
      }

      if (match && node !== this) results.push(node);
      for (const ch of node.children) check(ch);
    };
    check(this);
    return results;
  }
}

// Extract ICON_PACKS definition and applyIconPack function from app.js
function setupIconPackHarness() {
  const iconPacksMatch = appContent.match(/const ICON_PACKS = \{[\s\S]*?\n  \};/);
  if (!iconPacksMatch) throw new Error('Could not extract ICON_PACKS from app.js');

  const fnMatch = appContent.match(/function applyIconPack\(pack\) \{([\s\S]*?\n  \})/);
  if (!fnMatch) throw new Error('Could not extract applyIconPack from app.js');

  const harnessCode = `
    ${iconPacksMatch[0]}
    return {
      ICON_PACKS,
      applyIconPack: ${fnMatch[0]}
    };
  `;
  return new Function(harnessCode)();
}

function createMockEnvironment() {
  const body = new MockDOMNode('body');
  const navDiscover = new MockDOMNode('button', 'nav-discover', 'nav-item active');
  const navIndicator = new MockDOMNode('div', '', 'nav-indicator');
  const homeImg = new MockDOMNode('img', 'nav-home-app-icon', 'nav-home-app-icon');
  navIndicator.appendChild(homeImg);
  navDiscover.appendChild(navIndicator);
  body.appendChild(navDiscover);

  const navFavorites = new MockDOMNode('button', 'nav-favorites', 'nav-item');
  const favSvg = new MockDOMNode('svg');
  favSvg.innerHTML = '<path d="original-heart"></path>';
  navFavorites.appendChild(favSvg);
  body.appendChild(navFavorites);

  const volIcon = new MockDOMNode('svg', 'volume-icon');
  volIcon.innerHTML = '<polygon points="original-vol"></polygon>';
  body.appendChild(volIcon);

  const labelEl = new MockDOMNode('span', 'icon-pack-label');
  body.appendChild(labelEl);

  const menuEl = new MockDOMNode('div', 'icon-pack-menu');
  const optMat = new MockDOMNode('div', '', 'm3-dropdown-option');
  optMat.dataset.value = 'material';
  const optSf = new MockDOMNode('div', '', 'm3-dropdown-option');
  optSf.dataset.value = 'sf';
  const optLucide = new MockDOMNode('div', '', 'm3-dropdown-option');
  optLucide.dataset.value = 'lucide';
  const optSolar = new MockDOMNode('div', '', 'm3-dropdown-option');
  optSolar.dataset.value = 'solar';
  menuEl.appendChild(optMat);
  menuEl.appendChild(optSf);
  menuEl.appendChild(optLucide);
  menuEl.appendChild(optSolar);
  body.appendChild(menuEl);

  global.document = {
    body,
    getElementById: (id) => body.querySelector(`#${id}`) || (body.id === id ? body : null),
    querySelector: (sel) => {
      if (sel === '#nav-discover') return navDiscover;
      if (sel === '#nav-favorites svg') return favSvg;
      if (sel === '#volume-icon') return volIcon;
      if (sel === '#icon-pack-label') return labelEl;
      if (sel === '#icon-pack-menu') return menuEl;
      return body.querySelector(sel);
    },
    createElementNS: (ns, tag) => new MockDOMNode(tag)
  };

  return { body, navDiscover, homeImg, favSvg, volIcon, labelEl, menuEl };
}

test('Challenger M3 - Icon Pack Switching on #nav-discover & Subsystem Verification', async (t) => {
  const { ICON_PACKS, applyIconPack } = setupIconPackHarness();

  await t.test('ICON_PACKS defines non-empty SVGs for all packs including #nav-discover svg', () => {
    assert.ok(ICON_PACKS.sf, 'SF pack must exist');
    assert.ok(ICON_PACKS.lucide, 'Lucide pack must exist');
    assert.ok(ICON_PACKS.solar, 'Solar pack must exist');

    for (const packKey of ['sf', 'lucide', 'solar']) {
      const pack = ICON_PACKS[packKey];
      assert.ok(pack['#nav-discover svg'], `Pack ${packKey} must define #nav-discover svg`);
      assert.ok(pack['#nav-discover svg'].trim().length > 10, `Pack ${packKey} #nav-discover svg must be valid`);
      assert.ok(pack['#volume-icon'], `Pack ${packKey} must define #volume-icon`);
      assert.ok(pack['#nav-favorites svg'], `Pack ${packKey} must define #nav-favorites svg`);
    }
  });

  await t.test('switching #nav-discover to SF, Lucide, and Solar creates and updates pack SVG while hiding app image', () => {
    const { navDiscover, homeImg } = createMockEnvironment();

    // 1. Switch to SF
    applyIconPack('sf');
    assert.equal(homeImg.style.display, 'none', 'App icon img must be hidden in SF pack');
    const sfSvg = navDiscover.querySelector('svg.nav-discover-pack-svg');
    assert.ok(sfSvg, 'SVG with nav-discover-pack-svg class must be created');
    assert.equal(sfSvg.getAttribute('width'), '20');
    assert.equal(sfSvg.getAttribute('height'), '20');
    assert.equal(sfSvg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(sfSvg.innerHTML, ICON_PACKS.sf['#nav-discover svg']);

    // 2. Switch to Lucide: should update existing SVG without duplicating
    applyIconPack('lucide');
    assert.equal(homeImg.style.display, 'none');
    const allLucideSvgs = navDiscover.querySelectorAll('svg.nav-discover-pack-svg');
    assert.equal(allLucideSvgs.length, 1, 'Must have exactly 1 pack SVG element');
    assert.equal(allLucideSvgs[0].innerHTML, ICON_PACKS.lucide['#nav-discover svg']);

    // 3. Switch to Solar: should update existing SVG
    applyIconPack('solar');
    assert.equal(homeImg.style.display, 'none');
    const allSolarSvgs = navDiscover.querySelectorAll('svg.nav-discover-pack-svg');
    assert.equal(allSolarSvgs.length, 1);
    assert.equal(allSolarSvgs[0].innerHTML, ICON_PACKS.solar['#nav-discover svg']);

    // 4. Switch back to Material (default): should remove SVG and unhide image
    applyIconPack('material');
    assert.equal(homeImg.style.display, '', 'App icon img must be visible in Material pack');
    const removedSvg = navDiscover.querySelector('svg.nav-discover-pack-svg');
    assert.equal(removedSvg, null, 'Pack SVG must be removed from DOM in Material pack');
  });

  await t.test('switching is strictly idempotent and prevents duplicate SVG injection', () => {
    const { navDiscover } = createMockEnvironment();

    // Apply SF 5 times consecutively
    applyIconPack('sf');
    applyIconPack('sf');
    applyIconPack('sf');
    applyIconPack('sf');
    applyIconPack('sf');

    const svgs = navDiscover.querySelectorAll('svg.nav-discover-pack-svg');
    assert.equal(svgs.length, 1, 'Multiple consecutive apply calls must never create duplicate SVGs');
  });

  await t.test('unrecognized pack inputs safely default to Material without throwing', () => {
    const { body, homeImg, navDiscover } = createMockEnvironment();
    const badPacks = ['unknown_pack', '', null, undefined, 12345, {}];

    for (const bad of badPacks) {
      assert.doesNotThrow(() => applyIconPack(bad));
      assert.equal(body.getAttribute('data-icon-pack'), 'material', `Bad pack input ${bad} must set data-icon-pack="material"`);
      assert.equal(homeImg.style.display, '', 'App icon must remain visible');
      assert.equal(navDiscover.querySelector('svg.nav-discover-pack-svg'), null, 'No custom pack SVG should remain');
    }
  });

  await t.test('other icons save original SVG and restore accurately on Material', () => {
    const { favSvg, volIcon } = createMockEnvironment();

    applyIconPack('lucide');
    assert.equal(favSvg.innerHTML, ICON_PACKS.lucide['#nav-favorites svg']);
    assert.equal(volIcon.innerHTML, ICON_PACKS.lucide['#volume-icon']);
    assert.equal(favSvg.dataset.origSvg, '<path d="original-heart"></path>');
    assert.equal(volIcon.dataset.origSvg, '<polygon points="original-vol"></polygon>');

    applyIconPack('material');
    assert.equal(favSvg.innerHTML, '<path d="original-heart"></path>', 'Favorites original SVG must be restored');
    assert.equal(volIcon.innerHTML, '<polygon points="original-vol"></polygon>', 'Volume icon original SVG must be restored');
  });

  await t.test('resilience: handles missing #nav-discover or #nav-home-app-icon gracefully', () => {
    createMockEnvironment();
    // Temporarily mock document without #nav-discover
    const origGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => id === 'nav-discover' ? null : origGetElementById(id);

    assert.doesNotThrow(() => applyIconPack('sf'));
    assert.doesNotThrow(() => applyIconPack('material'));

    global.document.getElementById = origGetElementById;
  });

  await t.test('fuzz stress harness: 1,000 rapid randomized pack switches maintains DOM invariants', () => {
    const { navDiscover, homeImg } = createMockEnvironment();
    const packs = ['material', 'sf', 'lucide', 'solar', 'bogus', '', null];

    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const p = packs[Math.floor(Math.random() * packs.length)];
      applyIconPack(p);

      const isCustom = ['sf', 'lucide', 'solar'].includes(p);
      const customSvgs = navDiscover.querySelectorAll('svg.nav-discover-pack-svg');

      if (isCustom) {
        assert.equal(customSvgs.length, 1, `Iteration ${i}: custom pack ${p} must have exactly 1 SVG`);
        assert.equal(homeImg.style.display, 'none', `Iteration ${i}: app icon must be hidden for ${p}`);
      } else {
        assert.equal(customSvgs.length, 0, `Iteration ${i}: default pack ${p} must have 0 custom SVGs`);
        assert.equal(homeImg.style.display, '', `Iteration ${i}: app icon must be visible for ${p}`);
      }
    }
    const elapsed = performance.now() - t0;
    assert.ok(elapsed < 1000, `1,000 pack switches took ${elapsed.toFixed(2)}ms (expected < 1,000ms)`);
  });
});

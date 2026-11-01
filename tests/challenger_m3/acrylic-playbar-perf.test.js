const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STYLES_PATH = path.join(ROOT_DIR, 'src', 'renderer', 'styles.css');
const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');

test('Challenger M3 - Acrylic Playbar Frosted Glass & Performance Mode Suite', async (t) => {
  await t.test('default modern dock playbar enables frosted acrylic backdrop-filter and saturation', () => {
    const playbarRuleMatch = stylesContent.match(/body:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{([^}]+)\}/);
    assert.ok(playbarRuleMatch, 'Modern dock playbar rule must be defined');
    const rule = playbarRuleMatch[1];

    assert.match(rule, /backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important;/, 'Must specify 20px blur and 1.8 saturation');
    assert.match(rule, /-webkit-backdrop-filter:\s*blur\(20px\)\s+saturate\(1\.8\)\s*!important;/, 'Must include webkit prefix for Chromium');
    assert.match(rule, /background:\s*color-mix\(in\s+srgb,\s*var\(--panel-bg\)\s+75%,\s*transparent\)\s*!important;/, 'Must use translucent color-mix for acrylic transparency');
  });

  await t.test('modern dock playbar features hairline top border highlight and subtle elevation shadow', () => {
    const playbarRuleMatch = stylesContent.match(/body:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{([^}]+)\}/);
    assert.ok(playbarRuleMatch);
    const rule = playbarRuleMatch[1];

    assert.match(rule, /border-top:\s*none\s*!important;/, 'Must enforce clean borderless top for modern frosted playbar');
    assert.match(rule, /box-shadow:\s*0\s+-4px\s+20px\s+rgba\(0,\s*0,\s*0,\s*0\.1[28]\)\s*!important;/, 'Must define subtle upward elevation shadow');
    assert.match(rule, /height:\s*96px\s*!important;/, 'Height must be standard 96px dock height');
  });

  await t.test('performance mode body.perf strictly disables playbar blur and restores opaque background', () => {
    const perfPlaybarMatch = stylesContent.match(/body\.perf:not\(\.classic-sidebar\):not\(\.mini\)\s+\.playbar\s*\{([^}]+)\}/);
    assert.ok(perfPlaybarMatch, 'body.perf playbar rule must be defined');
    const perfRule = perfPlaybarMatch[1];

    assert.match(perfRule, /backdrop-filter:\s*none\s*!important;/, 'Perf mode must disable backdrop-filter');
    assert.match(perfRule, /-webkit-backdrop-filter:\s*none\s*!important;/, 'Perf mode must disable -webkit-backdrop-filter');
    assert.match(perfRule, /background:\s*var\(--panel-bg\)\s*!important;/, 'Perf mode must use solid opaque --panel-bg');
  });

  await t.test('performance mode body.perf enforces global fallback disabling backdrop-filter and transitions', () => {
    // Global wildcard override for perf
    assert.match(stylesContent, /body\.perf\s+\*,\s*body\.perf\s+\*::before,\s*body\.perf\s+\*::after\s*\{[^}]*backdrop-filter:\s*none\s*!important;\s*-webkit-backdrop-filter:\s*none\s*!important;\s*\}/, 'Global wildcard must disable all backdrop filters in perf mode');

    // Transitions killed in perf mode
    assert.match(stylesContent, /body\.perf\s+:is\([\s\S]*?\.titlebar-btn[\s\S]*?\)\s*\{[^}]*transition:\s*none\s*!important;\s*\}/, 'Perf mode must disable transitions on controls and buttons');

    // Mesh animations paused/killed in perf mode
    assert.match(stylesContent, /body\.perf\s+\[class\*="mesh"\][^}]*animation:\s*none\s*!important;/, 'Perf mode must disable mesh animations');
  });

  await t.test('classic-sidebar and mini player modes consistently disable acrylic blur', () => {
    // Classic sidebar rule
    assert.match(stylesContent, /body\.classic-sidebar:not\(\.mini\)\s+\.playbar[\s\S]*?backdrop-filter:\s*none\s*!important;/);

    // Mini player rule
    const miniMatch = stylesContent.match(/body\.mini\s+\.playbar\s*\{([^}]+)\}/);
    assert.ok(miniMatch, 'body.mini .playbar rule must exist');
    assert.match(miniMatch[1], /background:\s*var\(--md-sys-color-surface-container\)\s*!important;/);
  });

  await t.test('unfocused window mode (body.unfocused) safely disables backdrop-filter', () => {
    assert.match(stylesContent, /body\.unfocused\s+\*,\s*body\.unfocused\s+\*::before,\s*body\.unfocused\s+\*::after\s*\{[^}]*backdrop-filter:\s*none\s*!important;\s*-webkit-backdrop-filter:\s*none\s*!important;\s*\}/);
  });
});

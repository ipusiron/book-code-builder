'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync(require.resolve('../style.css'), 'utf8');
const sections = [...css.matchAll(/:root\s*\{([^}]+)\}/g)];
const colors = text => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
function luminance(hex) {
  const values = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
for (const mode of ['light', 'dark']) {
  const palette = { ...colors(sections[0][1]), ...(mode === 'dark' ? colors(sections[1][1]) : {}) };
  for (const [fg, bg] of [['fg','panel'], ['muted','panel'], ['muted','bg'], ['on-accent','accent'],
    ['accent','panel'], ['accent','info-bg'], ['error','error-bg'], ['success','success-bg'], ['warning','warning-bg']]) {
    test(`${mode} ${fg}/${bg} contrast >= 4.5`, () => {
      const values = [luminance(palette[fg]), luminance(palette[bg])].sort((a,b) => b-a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(ratio >= 4.5, String(ratio));
    });
  }
}

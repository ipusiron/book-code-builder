'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const messages = require('../messages.js');
const english = require('../static-messages.js');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
test('dynamic language keys and interpolation fields match', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ja).sort());
  for (const key of Object.keys(messages.ja)) {
    assert.deepEqual((messages.en[key].match(/\{\w+\}/g) || []).sort(), (messages.ja[key].match(/\{\w+\}/g) || []).sort(), key);
    assert.ok(!japanese.test(messages.en[key]), key);
  }
});
test('every Japanese static text node has an English translation', () => {
  const source = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  for (const match of source.matchAll(/>([^<>]+)</g)) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (japanese.test(text)) assert.ok(english[text], text);
  }
});
test('Japanese accessible names, titles and placeholders are translated', () => {
  for (const [, text] of html.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) {
    if (japanese.test(text)) assert.ok(english[text], text);
  }
});
test('all static English values are nonempty and contain no Japanese', () => {
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim(), key); assert.ok(!japanese.test(value), key);
  }
});
test('every referenced local script and stylesheet exists', () => {
  for (const [, path] of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css))"/g)) {
    assert.ok(fs.existsSync(require('node:path').join(__dirname, '..', path)), path);
  }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
test('decoding one maximum-size word succeeds exactly at the output limit', () => {
  const book = C.buildIndex('x'.repeat(C.LIMITS.decoded));
  assert.equal(C.decode(book, '1:1:1').text.length, C.LIMITS.decoded);
  assert.throws(() => C.decode(book, '1:1:1 1:1:1'), /outputLimit/);
});
test('repeating a long word cannot allocate unbounded decoded output', () => {
  const book = C.buildIndex('x'.repeat(10000));
  assert.throws(() => C.decode(book, Array(10000).fill('1:1:1').join(' ')), /outputLimit/);
});
test('encoded output fits the cipher input limit and a failure preserves caller pointers', () => {
  const book = C.buildIndex('\n'.repeat(49999) + 'z '.repeat(99998) + 'a a', { lpp: 1 });
  const pointers = new Map([['a', 1]]);
  assert.throws(() => C.encode(book, Array(10000).fill('a').join(' '), true, pointers), /outputLimit/);
  assert.equal(pointers.get('a'), 1);
});
test('documented six-word reference and CTF exercise produce exact results', () => {
  const book = C.buildIndex('alpha beta\n\ngamma alpha\nbeta delta', { lpp: 2 });
  assert.deepEqual(book.totals, { pages: 2, lines: 4, words: 6, unique: 4 });
  const result = C.encode(book, 'alpha alpha alpha beta delta');
  assert.equal(result.text, '1:1:1 2:1:2 1:1:1 1:1:2 2:2:2');
  assert.equal(C.decode(book, result.text).text, 'alpha alpha alpha beta delta');
  assert.equal(C.decode(book, '2:1:1 1:1:1 2:2:2').text, 'gamma alpha delta');
});

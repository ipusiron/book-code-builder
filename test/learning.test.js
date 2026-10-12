'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const samples = require('../learning-samples.js');
const book = C.buildIndex(samples[0].reference, { lpp: 2 });

test('trace records actual choices, including a nonzero caller pointer', () => {
  const pointers = new Map([['alpha', 1]]);
  const r = C.encode(book, 'ＡＬＰＨＡ, alpha! unknown', true, pointers);
  assert.equal(r.normalized, 'alpha, alpha! unknown');
  assert.equal(r.text, '2:1:2 1:1:1 {???}');
  assert.deepEqual(r.trace, [
    { word: 'alpha', occurrences: 2, coordinate: { p: 2, l: 1, w: 2 }, code: '2:1:2' },
    { word: 'alpha', occurrences: 2, coordinate: { p: 1, l: 1, w: 1 }, code: '1:1:1' },
    { word: 'unknown', occurrences: 0, coordinate: null, code: '{???}' },
  ]);
  assert.equal(pointers.get('alpha'), 1);
  r.trace[0].coordinate.p = 999;
  assert.equal(book.index.get('alpha')[1].p, 2);
});

test('missing occurrences and unique counts use normalized words and first-seen order', () => {
  const r = C.encode(book, 'alpha HELLO hello world world world');
  assert.deepEqual(r.missingCounts, [{ word: 'hello', count: 2 }, { word: 'world', count: 3 }]);
  assert.equal(r.missing.length, 5);
  assert.equal(r.count, 6);
  assert.equal(r.encodedCount, 1);
  assert.equal(r.missingCounts.reduce((n, row) => n + row.count, 0), 5);
  assert.deepEqual(C.encode(book, 'constructor constructor __proto__').missingCounts,
    [{ word: 'constructor', count: 2 }, { word: 'proto', count: 1 }]);
});

test('comparison is reproducible, independent of normal pointers and includes cycle wrap', () => {
  const before = JSON.stringify(book.structure);
  const pointers = C.encode(book, 'alpha').pointers;
  const r = C.compare(book, samples[1].plain);
  assert.equal(r.on.text, '1:1:1 2:1:2 1:1:1 1:1:2 2:2:2');
  assert.equal(r.off.text, '1:1:1 1:1:1 1:1:1 1:1:2 2:2:2');
  assert.deepEqual(r.rows.map(row => row.different), [false, true, false, false, false]);
  assert.equal(r.differentCount, 1);
  assert.deepEqual(C.compare(book, samples[1].plain), r);
  assert.equal(C.encode(book, 'alpha', true, pointers).text, '2:1:2');
  assert.equal(JSON.stringify(book.structure), before);
});

test('missing and single-location words do not create comparison differences', () => {
  const r = C.compare(book, 'delta delta unknown unknown');
  assert.equal(r.differentCount, 0);
  assert.equal(r.on.text, '2:2:2 2:2:2 {???} {???}');
  assert.equal(r.on.encodedCount, 2);
});

const expected = [
  ['1:1:1 1:1:2 2:1:1 2:2:2', 'alpha beta gamma delta', 0],
  ['1:1:1 2:1:2 1:1:1 1:1:2 2:2:2', 'alpha alpha alpha beta delta', 0],
  ['1:1:1 {???} {???} {???} {???} {???}', 'alpha [?] [?] [?] [?] [?]', 5],
  ['1:1:1 2:1:2 1:1:2', 'alpha alpha beta', 0],
];
samples.forEach((sample, i) => test(`paired sample ${sample.id} has exact results`, () => {
  const b = C.buildIndex(sample.reference, sample);
  const r = C.encode(b, sample.plain, sample.roundRobin);
  assert.equal(r.text, expected[i][0]);
  assert.equal(C.decode(b, r.text).text, expected[i][1]);
  assert.equal(r.missing.length, expected[i][2]);
  assert.ok(Object.isFrozen(sample));
}));

test('trace respects normalization flags, including compatibility expansion', () => {
  const b = C.buildIndex('ﬃ FFI ffi Ａ', { lower: false, nfkc: false });
  assert.deepEqual(C.encode(b, 'ﬃ FFI ffi Ａ').trace.map(r => r.word), ['ﬃ', 'FFI', 'ffi', 'Ａ']);
  const normalized = C.encode(C.buildIndex('ffi a'), 'ﬃ Ａ');
  assert.equal(normalized.normalized, 'ffi a');
  assert.equal(normalized.encodedCount, 2);
});

test('comparison enforces limits instead of publishing partial output', () => {
  assert.throws(() => C.compare(book, 'x'.repeat(C.LIMITS.plain + 1)), /textLimit/);
  assert.throws(() => C.compare(book, 'ﬃ'.repeat(7000)), /textLimit/);
  assert.throws(() => C.compare(book, '!!!'), /noWords/);
  const many = C.compare(C.buildIndex('a a'), 'a '.repeat(10000));
  assert.equal(many.rows.length, 10000);
  assert.equal(many.differentCount, 5000);
});

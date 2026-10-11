'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const small = 'alpha beta\n\ngamma alpha\nbeta delta';

test('known coordinates include blank lines and page boundaries', () => {
  const book = C.buildIndex(small, { lpp: 2 });
  assert.deepEqual(book.totals, { pages: 2, lines: 4, words: 6, unique: 4 });
  assert.equal(C.encode(book, 'alpha alpha alpha beta delta').text, '1:1:1 2:1:2 1:1:1 1:1:2 2:2:2');
  assert.equal(C.decode(book, '1:1:1 2:1:2 1:1:1 1:1:2 2:2:2').text, 'alpha alpha alpha beta delta');
});
test('round robin is deterministic and does not mutate caller pointers', () => {
  const book = C.buildIndex(small);
  const pointers = new Map();
  const first = C.encode(book, 'alpha', true, pointers);
  assert.equal(pointers.size, 0);
  assert.equal(C.encode(book, 'alpha', true, first.pointers).text, '1:3:2');
  assert.equal(C.encode(book, 'alpha alpha', false, first.pointers).text, '1:1:1 1:1:1');
});
test('missing words and malformed or out-of-range coordinates are explicit', () => {
  const book = C.buildIndex(small);
  assert.deepEqual(C.encode(book, 'unknown unknown').missing, ['unknown', 'unknown']);
  assert.equal(C.encode(book, 'unknown').text, '{???}');
  const result = C.decode(book, '1:1:1, 0:1:1; 1:2:1 5:1:1 abc 1:1:999 9007199254740993:1:1');
  assert.equal(result.text, 'alpha [?] [?] [?] [?] [?] [?]');
  assert.equal(result.bad, 6);
});
for (const lower of [false, true]) for (const nfkc of [false, true]) {
  test(`normalization and round trip lower=${lower}, nfkc=${nfkc}`, () => {
    const input = 'Hello ＡＢＣ café 123 co-operate don\'t 日本語';
    const book = C.buildIndex(input, { lower, nfkc });
    const encoded = C.encode(book, input);
    assert.equal(C.decode(book, encoded.text).text, C.tokenize(C.normalizeText(input, { lower, nfkc })).join(' '));
    assert.equal(encoded.missing.length, 0);
  });
}
test('tokenization limitations are explicit and stable', () => {
  assert.deepEqual(C.tokenize("don't don’t co-operate 日本語の文 🙂 cafe\u0301"),
    ["don't", 'don', 't', 'co-operate', '日本語の文', 'cafe']);
  assert.equal(C.decode(C.buildIndex('Hi!\nHi?'), '1:1:1 1:2:1').text, 'hi hi');
});
test('line endings and trailing blank lines', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const book = C.buildIndex(`one${newline}${newline}two${newline}`, { lpp: 2 });
    assert.equal(C.encode(book, 'two').text, '2:1:1');
    assert.equal(book.totals.lines, 4);
  }
});
for (const value of ['', 0, -1, 1.5, 201, Infinity, NaN, null, true, {}, 'bad']) {
  test(`reject invalid lines per page: ${String(value)}`, () => {
    assert.throws(() => C.buildIndex('one', { lpp: value }), /integer/);
  });
}
for (const value of [1, 40, 200, '2']) {
  test(`accept valid lines per page: ${value}`, () => assert.ok(C.buildIndex('one', { lpp: value })));
}
test('reference length limit and normalization expansion', () => {
  assert.ok(C.buildIndex('x'.repeat(C.LIMITS.reference)));
  assert.throws(() => C.buildIndex('x'.repeat(C.LIMITS.reference + 1)), /textLimit/);
  assert.throws(() => C.buildIndex('ﬃ'.repeat(400000)), /textLimit/);
});
test('line and word limits', () => {
  assert.ok(C.buildIndex('x' + '\n'.repeat(C.LIMITS.lines - 1)));
  assert.throws(() => C.buildIndex('x' + '\n'.repeat(C.LIMITS.lines)), /lineLimit/);
  assert.ok(C.buildIndex('x '.repeat(C.LIMITS.words)));
  assert.throws(() => C.buildIndex('x '.repeat(C.LIMITS.words + 1)), /wordLimit/);
});
test('input and token limits reject without truncation', () => {
  const book = C.buildIndex('x');
  assert.equal(C.encode(book, 'x '.repeat(C.LIMITS.tokens)).count, C.LIMITS.tokens);
  assert.throws(() => C.encode(book, 'x'.repeat(C.LIMITS.plain + 1)), /textLimit/);
  assert.throws(() => C.decode(book, '1:1:1 '.repeat(C.LIMITS.tokens + 1)), /tokenLimit/);
  assert.throws(() => C.decode(book, 'x'.repeat(C.LIMITS.cipher + 1)), /textLimit/);
});
test('empty and nontext inputs', () => {
  for (const input of ['', ' ', '!!!', '🙂']) assert.throws(() => C.buildIndex(input), /noWords/);
  assert.throws(() => C.buildIndex(null), /textType/);
  const book = C.buildIndex('x');
  assert.throws(() => C.encode(book, '!!!'), /noWords/);
  assert.throws(() => C.decode(book, ' , ;'), /noCodes/);
});
for (const name of ['../a.txt', 'a/b.txt', 'a\\b.txt', 'a\nb.txt', 'a.txt?x', '', null, 'a.html']) {
  test(`reject unsafe filename ${JSON.stringify(name)}`, () => assert.equal(C.validateFilename(name), false));
}
test('all bundled books preserve the original coordinate convention', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/manifest.json'), 'utf8'));
  for (const entry of manifest.codebooks) {
    assert.equal(C.validateFilename(entry.filename), true);
    const raw = fs.readFileSync(path.join(__dirname, '../data', entry.filename), 'utf8');
    for (const lower of [false, true]) for (const nfkc of [false, true]) for (const lpp of [1, 40, 200]) {
      const book = C.buildIndex(raw, { lower, nfkc, lpp });
      let n = 0;
      C.normalizeText(raw, { lower, nfkc }).split(/\r?\n/).forEach((line, i) => {
        const words = line.match(/[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu) || [];
        words.forEach((word, w) => {
          const coordinate = `${Math.floor(i / lpp) + 1}:${i % lpp + 1}:${w + 1}`;
          assert.equal(C.decode(book, coordinate).text, word);
          n++;
        });
      });
      assert.equal(book.totals.words, n);
    }
  }
});

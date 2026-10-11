/* Book Code Builder: deterministic, DOM-free coordinate conversion. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BookCodeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ reference: 1000000, words: 100000, lines: 50000,
    plain: 20000, cipher: 100000, decoded: 1000000, tokens: 10000, lpp: 200, viewWords: 2000, viewLines: 100, occurrences: 100 });
  // Keep the coordinate convention: ASCII apostrophe/hyphen only; no linguistic segmentation.
  const WORD_RE = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu;

  function fail(code) { throw new RangeError(code); }
  function checkText(text, max) {
    if (typeof text !== 'string') fail('textType');
    if (text.length > max) fail('textLimit');
    return text;
  }
  function normalizeText(text, { lower = true, nfkc = true } = {}) {
    let result = text;
    if (nfkc) result = result.normalize('NFKC');
    return lower ? result.toLowerCase() : result;
  }
  function tokenize(text) { return text.match(WORD_RE) || []; }
  function positiveInteger(value, max) {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') fail('integer');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) fail('integer');
    return number;
  }
  function buildIndex(raw, { lpp = 40, lower = true, nfkc = true } = {}) {
    checkText(raw, LIMITS.reference);
    lpp = positiveInteger(lpp, LIMITS.lpp);
    const text = normalizeText(raw, { lower, nfkc });
    // Compatibility normalization can expand text (e.g. ligatures).
    checkText(text, LIMITS.reference);
    const lines = text.split(/\r\n?|\n/);
    if (lines.length > LIMITS.lines) fail('lineLimit');
    const structure = [];
    const index = new Map();
    let totalWords = 0;
    lines.forEach((line, i) => {
      const words = tokenize(line);
      totalWords += words.length;
      if (totalWords > LIMITS.words) fail('wordLimit');
      const p = Math.floor(i / lpp);
      const l = i % lpp;
      if (!structure[p]) structure[p] = [];
      structure[p].push(words);
      words.forEach((word, w) => {
        if (!index.has(word)) index.set(word, []);
        index.get(word).push({ p: p + 1, l: l + 1, w: w + 1 });
      });
    });
    if (!totalWords) fail('noWords');
    return { structure, index, normalizedLines: lines, lpp, normCase: lower, normNFKC: nfkc,
      totals: { pages: structure.length, lines: lines.length, words: totalWords, unique: index.size } };
  }
  function encode(book, raw, roundRobin = true, pointers = new Map()) {
    checkText(raw, LIMITS.plain);
    const normalized = normalizeText(raw, { lower: book.normCase, nfkc: book.normNFKC });
    checkText(normalized, LIMITS.plain);
    const words = tokenize(normalized);
    if (words.length > LIMITS.tokens) fail('tokenLimit');
    if (!words.length) fail('noWords');
    const next = new Map(pointers);
    const missing = [];
    let length = 0;
    const codes = words.map(word => {
      const locations = book.index.get(word);
      if (!locations) { missing.push(word); return '{???}'; }
      const pointer = roundRobin ? (next.get(word) || 0) % locations.length : 0;
      const { p, l, w } = locations[pointer];
      if (roundRobin) next.set(word, (pointer + 1) % locations.length);
      return `${p}:${l}:${w}`;
    });
    for (const code of codes) length += code.length;
    if (length + codes.length - 1 > LIMITS.cipher) fail('outputLimit');
    return { text: codes.join(' '), missing, pointers: next, count: words.length };
  }
  function parseCodeTokens(raw) {
    checkText(raw, LIMITS.cipher);
    const tokens = raw.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length > LIMITS.tokens) fail('tokenLimit');
    return tokens.map(token => {
      if (!/^\d+:\d+:\d+$/.test(token)) return null;
      const values = token.split(':').map(Number);
      return values.every(n => Number.isSafeInteger(n) && n > 0) ? values : null;
    });
  }
  function decode(book, raw) {
    const tokens = parseCodeTokens(raw);
    if (!tokens.length) fail('noCodes');
    let bad = 0;
    let length = 0;
    const words = tokens.map(t => {
      const word = t && book.structure[t[0] - 1]?.[t[1] - 1]?.[t[2] - 1];
      const value = word || '[?]';
      if (!word) bad++;
      length += value.length + (length ? 1 : 0);
      if (length > LIMITS.decoded) fail('outputLimit');
      return value;
    });
    return { text: words.join(' '), bad, count: tokens.length };
  }
  function validateFilename(filename) {
    return typeof filename === 'string' && filename.length <= 200 && /^[a-zA-Z0-9 _'-]+\.txt$/.test(filename);
  }
  return Object.freeze({ LIMITS, normalizeText, tokenize, positiveInteger, buildIndex, encode, decode,
    parseCodeTokens, validateFilename });
});

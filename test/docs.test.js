'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const ja = read('README.md'), en = read('README.en.md');
const body = text => text.replace(/<!--[\s\S]*?-->/g, '');
test('README languages have matching heading levels and emoji section markers', () => {
  const structure = text => [...body(text).matchAll(/^(#{1,6}) (.*)$/gm)].map(m => [m[1].length, m[2].match(/^\p{Extended_Pictographic}/u)?.[0] || '']);
  assert.deepEqual(structure(ja), structure(en));
});
test('README numeric tables and literal examples agree across languages', () => {
  const numbers = text => [...body(text).matchAll(/^\|.*$/gm)].map(m => m[0].match(/\d[\d,]*/g) || []);
  assert.deepEqual(numbers(ja), numbers(en));
  const code = text => [...text.matchAll(/```(?:text|sh)\n([\s\S]*?)```/g)].map(m => m[1].replace(/#.*$/gm, '').trim());
  assert.deepEqual(code(ja), code(en));
});
test('README worked example is extracted and executed, not just compared as prose', () => {
  for (const text of [ja, en]) {
    const examples = [...text.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1]);
    const book = C.buildIndex(examples[0], { lpp: 2 });
    assert.equal(C.encode(book, 'alpha alpha alpha beta delta').text, examples[1]);
    assert.equal(C.decode(book, examples[1]).text, 'alpha alpha alpha beta delta');
  }
});
test('all relative documentation links and screenshots exist', () => {
  for (const name of ['README.md', 'README.en.md', 'TECHNICAL.md', 'data/README.md']) {
    for (const [, target] of read(name).matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), target.split('#')[0])), name + ': ' + target);
    }
  }
});
test('README outbound links agree except language navigation and localized screenshots', () => {
  const links = text => [...text.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1])
    .filter(x => !x.startsWith('README.') && !x.startsWith('assets/')).sort();
  assert.deepEqual(links(ja), links(en));
});
test('bundled book metadata and documented counts match the actual files', () => {
  const books = JSON.parse(read('data/manifest.json')).codebooks;
  const expected = [[809, 4717, 1241], [1211, 5664, 1364], [182, 1191, 288]];
  books.forEach((entry, i) => {
    const raw = read('data/' + entry.filename);
    const number = raw.match(/(?:eBook|Ebook)\s*#(\d+)/)?.[1];
    assert.ok(number, entry.id);
    assert.equal(entry.sourceUrl, 'https://www.gutenberg.org/ebooks/' + number);
    const totals = C.buildIndex(raw).totals;
    assert.deepEqual([totals.lines, totals.words, totals.unique], expected[i]);
    const row = read('data/README.md').split('\n').find(line => line.includes(entry.filename));
    for (const n of expected[i]) assert.ok(row.includes(n.toLocaleString('en-US')), row);
  });
});
test('documentation avoids outdated security claims and describes normalization loss', () => {
  assert.ok(ja.includes('句読点、元の改行、余分な空白は復元しません'));
  assert.ok(en.includes('not the original punctuation, line breaks or extra whitespace'));
  assert.ok(ja.includes('秘密情報の保護には使えません'));
  assert.ok(en.includes('Do not use this tool to protect secrets'));
  for (const text of [ja, en, read('TECHNICAL.md')]) {
    assert.ok(!text.includes('⭐'));
    assert.ok(!/http-equiv="X-Content-Type-Options"/.test(text));
    assert.ok(!/previously|used to|earlier version|formerly/i.test(text));
  }
});

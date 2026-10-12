'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../core.js');

function harness() {
  const elements = new Map();
  const timers = [];
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      id: selector.slice(1), value: '', checked: true, disabled: false, textContent: '', innerHTML: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      replaceChildren() {}, append() {},
      querySelectorAll: () => [], focus() {}, addEventListener() {}, setAttribute() {},
    });
    return elements.get(selector);
  };
  const document = { documentElement: { lang: 'ja' }, querySelector: element, querySelectorAll: () => [],
    createElement: () => element('created'), createTextNode: text => text, addEventListener() {} };
  const context = vm.createContext({ document, BookCodeCore: C, BookCodeMessages: require('../messages.js'),
    BookCodeLearningSamples: require('../learning-samples.js'),
    navigator: {}, setTimeout: callback => { const timer = { callback }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.callback = null; }, console,
    location: { protocol: 'file:' }, AbortController });
  vm.runInContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  element('#referenceText').value = 'alpha beta\ngamma alpha';
  element('#linesPerPage').value = '40';
  const flush = () => { while (timers.length) { const timer = timers.shift(); if (timer.callback) timer.callback(); } };
  return { run, element, flush, context };
}
test('conversion blocked until a build completes', () => {
  const h = harness();
  h.element('#plainInput').value = 'alpha';
  h.run('buildIndex(); encrypt();');
  assert.equal(h.element('#cipherOutput').value, '');
  assert.equal(h.run('state.ready'), false);
  h.flush();
  h.run('encrypt()');
  assert.equal(h.element('#cipherOutput').value, '1:1:1');
});
test('initialization binds controls without a selector error', async () => {
  const h = harness();
  await h.run('init()');
  h.flush();
  assert.equal(h.run('state.ready'), true);
});
for (const target of ['#referenceText', '#linesPerPage', '#normalizeCase', '#normalizeNFKC']) {
  test(`editing ${target} cannot silently use an old index`, () => {
    const h = harness();
    h.run('buildIndex()'); h.flush();
    h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
    if (target.startsWith('#normalize')) h.element(target).checked = false;
    else h.element(target).value = target === '#linesPerPage' ? '2' : 'omega';
    h.run('encrypt()');
    assert.equal(h.run('state.ready'), false);
    assert.equal(h.element('#cipherOutput').value, '');
    assert.equal(h.element('#copyCipherBtn').disabled, true);
    assert.equal(h.element('#syncCipherBtn').disabled, true);
  });
}
test('pending build cannot publish a stale snapshot', () => {
  const h = harness();
  h.run('buildIndex()');
  h.element('#referenceText').value = 'omega';
  h.run('invalidateBook()'); h.flush();
  assert.equal(h.run('state.ready'), false);
  h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'omega'; h.run('encrypt()');
  assert.equal(h.element('#cipherOutput').value, '1:1:1');
});
test('failed build leaves no usable old index', () => {
  const h = harness();
  h.run('buildIndex()'); h.flush();
  h.element('#referenceText').value = '!!!';
  h.run('buildIndex()'); h.flush();
  assert.equal(h.run('state.ready'), false);
  assert.equal(h.run('state.structure.length'), 0);
  assert.equal(h.element('#buildBtn').disabled, false);
});
test('reset clears copied and synchronized results', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt(); syncCipher(); decrypt();');
  assert.equal(h.element('#plainOutput').value, 'alpha');
  h.run("resetResult('encrypt'); resetResult('decrypt');");
  for (const id of ['#cipherOutput', '#plainOutput']) assert.equal(h.element(id).value, '');
  for (const id of ['#copyCipherBtn', '#copyPlainBtn', '#syncCipherBtn']) assert.equal(h.element(id).disabled, true);
});
test('plaintext sample invalidates encryption output', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt(); setPlaintextPreset(1);');
  assert.equal(h.element('#cipherOutput').value, '');
});
test('failed conversion does not advance round-robin pointers', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
  h.element('#plainInput').value = 'x'.repeat(C.LIMITS.plain + 1); h.run('encrypt()');
  h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
  assert.equal(h.element('#cipherOutput').value, '1:2:2');
});
for (const outcome of ['success', 'reject', 'unsupported', 'throw']) {
  test(`copy ${outcome} restores button state without throwing`, async () => {
    const h = harness(); h.run('buildIndex()'); h.flush();
    h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
    if (outcome !== 'unsupported') h.context.navigator.clipboard = {
      writeText() {
        if (outcome === 'throw') throw new Error('denied');
        return outcome === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve();
      },
    };
    h.run("copyToClipboard($('#cipherOutput').value, $('#copyCipherBtn'))");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.element('#copyCipherBtn').disabled, true);
    h.flush();
    assert.equal(h.element('#copyCipherBtn').disabled, false);
  });
}
test('late clipboard response cannot enable an invalidated result', async () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
  let resolve;
  h.context.navigator.clipboard = { writeText: () => new Promise(r => { resolve = r; }) };
  h.run("copyToClipboard($('#cipherOutput').value, $('#copyCipherBtn')); resetResult('encrypt');");
  resolve(); await new Promise(r => setImmediate(r)); h.flush();
  assert.equal(h.element('#copyCipherBtn').disabled, true);
  assert.equal(h.element('#cipherOutput').value, '');
});

test('learning views and comparison preserve actual encoding and normal pointers', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt()');
  const before = h.run('JSON.stringify(Array.from(state.rr))');
  h.run('compareRoundRobin(); refreshLanguage(); renderLearning();');
  assert.equal(h.run('JSON.stringify(Array.from(state.rr))'), before);
  assert.equal(h.element('#cipherOutput').value, '1:1:1');
  assert.equal(h.element('#compareOn').value, '1:1:1');
  h.run('encrypt()');
  assert.equal(h.element('#cipherOutput').value, '1:2:2');
  assert.equal(h.run('encodingResult.trace[0].code'), '1:2:2');
});

test('source invalidation clears trace, comparison and derived text', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha hello'; h.run('encrypt(); compareRoundRobin(); invalidateBook();');
  assert.equal(h.run('encodingResult'), null);
  assert.equal(h.run('comparisonResult'), null);
  assert.equal(h.element('#normalizedPlain').value, '');
  assert.equal(h.element('#compareOn').value, '');
  assert.equal(h.element('#compareBtn').disabled, true);
});

test('sample selection does not mutate input and explicit apply resets both inputs and options', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  const before = h.element('#referenceText').value;
  h.element('#cipherInput').value = '1:1:1';
  h.run("chooseLearningSample('repeat')");
  assert.equal(h.element('#referenceText').value, before);
  assert.equal(h.element('#cipherInput').value, '1:1:1');
  h.run('applyLearningSample()'); h.flush();
  assert.equal(h.element('#cipherInput').value, '');
  assert.equal(h.run('state.rr.size'), 0);
  assert.equal(h.run('book.lpp'), 2);
  h.run('encrypt()');
  assert.equal(h.element('#cipherOutput').value, '1:1:1 2:1:2 1:1:1 1:1:2 2:2:2');
});

test('invalid comparison clears only its own result and does not advance pointers', () => {
  const h = harness(); h.run('buildIndex()'); h.flush();
  h.element('#plainInput').value = 'alpha'; h.run('encrypt(); compareRoundRobin();');
  h.element('#plainInput').value = '!!!'; h.run('compareRoundRobin()');
  assert.equal(h.run('comparisonResult'), null);
  assert.equal(h.run('state.rr.get("alpha")'), 1);
  assert.equal(h.element('#compareOn').value, '');
});

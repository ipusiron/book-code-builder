/* Small, authored examples. Selection alone never changes inputs. */
(function (root) {
  'use strict';
  const reference = 'alpha beta\n\ngamma alpha\nbeta delta';
  const samples = [
    { id: 'complete', reference, plain: 'alpha beta gamma delta' },
    { id: 'repeat', reference, plain: 'alpha alpha alpha beta delta' },
    { id: 'missing', reference, plain: 'alpha hello hello world world world' },
    { id: 'normalize', reference, plain: 'ＡＬＰＨＡ, Alpha!\nＢＥＴＡ?' },
  ].map(sample => Object.freeze({ ...sample, lpp: 2, lower: true, nfkc: true, roundRobin: true }));
  Object.freeze(samples);
  if (typeof module === 'object' && module.exports) module.exports = samples;
  else root.BookCodeLearningSamples = samples;
})(typeof globalThis !== 'undefined' ? globalThis : this);

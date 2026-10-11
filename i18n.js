/* Static UI localization; mutable app state is refreshed separately without conversion. */
(function () {
  'use strict';
  const key = 'book-code-builder.language';
  const normalize = value => value.trim().replace(/\s+/g, ' ');
  const entries = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('script, style, noscript, textarea')) continue;
    const source = node.nodeValue;
    const translation = BookCodeStaticEnglish[normalize(source)];
    if (translation !== undefined) entries.push({ node, source, translation, last: source });
  }
  document.querySelectorAll('[title], [aria-label], [placeholder]').forEach(element => {
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      const source = element.getAttribute(attribute);
      const translation = source && BookCodeStaticEnglish[normalize(source)];
      if (translation !== undefined && translation !== null) entries.push({ element, attribute, source, translation, last: source });
    }
  });
  let saved;
  try { saved = localStorage.getItem(key); } catch (_) { /* Storage may be blocked. */ }
  const requested = new URLSearchParams(location.search).get('lang');
  const valid = language => language === 'ja' || language === 'en';
  let language = valid(requested) ? requested : valid(saved) ? saved : navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';

  function render() {
    document.documentElement.lang = language;
    for (const entry of entries) {
      const current = entry.node ? entry.node.nodeValue : entry.element.getAttribute(entry.attribute);
      if (!(entry.node || entry.element).isConnected || current !== entry.last) continue;
      const next = language === 'en' ? entry.translation : entry.source;
      if (entry.node) entry.node.nodeValue = next;
      else entry.element.setAttribute(entry.attribute, next);
      entry.last = next;
    }
    const button = document.getElementById('languageBtn');
    button.textContent = language === 'ja' ? 'English' : '日本語';
    button.lang = language === 'ja' ? 'en' : 'ja';
  }
  document.getElementById('languageBtn').addEventListener('click', () => {
    language = language === 'ja' ? 'en' : 'ja';
    try { localStorage.setItem(key, language); } catch (_) { /* Selection still applies to this page. */ }
    render();
    document.dispatchEvent(new Event('languagechange'));
  });
  render();
})();

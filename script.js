// Book Code Builder
// - Index by page:line:word using Lines Per Page (LPP)
// - Encode plain -> p:l:w  / Decode p:l:w -> plain
// - Case-insensitive + Unicode NFKC normalization options
// - Round-robin for words that appear multiple times

// ==================== Security Notes ====================
// This application implements the following security measures:
//
// 1. XSS Prevention:
//    - escapeHtml() function used for all user-provided content before innerHTML
//    - textContent used for simple text updates (safer than innerHTML)
//    - textarea.value used for user input/output (no HTML parsing)
//
// 2. Path Traversal Prevention:
//    - validateFilename() ensures only safe filenames in data/ folder
//    - Rejects path separators (/, \) and parent directory references (..)
//
// 3. Content Security Policy (CSP):
//    - Defined in index.html meta tags
//    - Restricts script/style sources to 'self'
//    - No eval() or inline scripts used
//
// 4. Input Validation:
//    - Numeric inputs validated with Math.max/min
//    - Coordinate parsing uses regex with strict format (p:l:w)
//    - File loading from trusted manifest.json only
//
// ========================================================

// -------------------- Utilities --------------------
// Shorthand selectors for cleaner DOM manipulation
// $(): returns single element (querySelector)
// $$(): returns array of elements (querySelectorAll)
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/**
 * Normalize text for consistent matching
 * @param {string} str - Input text to normalize
 * @param {Object} options - Normalization options
 * @param {boolean} options.lower - Convert to lowercase (default: true)
 * @param {boolean} options.nfkc - Apply Unicode NFKC normalization (default: true)
 * @returns {string} Normalized text
 *
 * Purpose: Ensure consistent matching between encoding and decoding
 * - NFKC: Converts full-width characters to half-width (e.g., "ＡＢＣ" → "ABC")
 * - lower: Case-insensitive matching (e.g., "Hello" → "hello")
 */
function normalizeText(str, options) {
  return BookCodeCore.normalizeText(str, options);
}

/**
 * Regular expression for word tokenization
 * Pattern: Unicode letters/numbers with optional internal hyphens/apostrophes
 *
 * Matches:
 * - Simple words: "hello", "world"
 * - Hyphenated: "co-operate", "self-driving"
 * - Apostrophes: "don't", "it's", "rock'n'roll"
 * - Mixed: "abc123", "COVID-19"
 *
 * Does NOT match:
 * - Punctuation: ".", ",", "!", "?"
 * - Leading/trailing hyphens: "-word", "word-"
 *
 * Flags:
 * - g: Global (find all matches)
 * - u: Unicode mode (enables \p{} patterns)
 */
const WORD_RE = /[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu;

/**
 * Extract words from a line of text
 * @param {string} line - Input text line
 * @returns {string[]} Array of words found in the line
 */
function tokenize(line) {
  return BookCodeCore.tokenize(line);
}

/**
 * Parse cipher text tokens in p:l:w format
 * @param {string} s - Cipher text containing space/comma/semicolon separated coordinates
 * @returns {Array<[number, number, number]|null>} Array of [page, line, word] triples (null for invalid tokens)
 *
 * Accepted formats:
 * - "1:2:3 4:5:6" (space separated)
 * - "1:2:3, 4:5:6" (comma separated)
 * - "1:2:3; 4:5:6" (semicolon separated)
 * - "1:2:3\n4:5:6" (newline separated)
 * - Mixed: "1:2:3, 4:5:6; 7:8:9"
 *
 * Invalid tokens return null in the array for error tracking
 */
function parseCodeTokens(text) {
  return BookCodeCore.parseCodeTokens(text);
}

/**
 * Copy text to clipboard with visual feedback
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - Button element to show feedback on
 *
 * Behavior:
 * - Success: Shows "✓ コピー完了" for 2 seconds
 * - Failure: Shows "✗ 失敗" for 2 seconds
 * - Button is disabled during feedback display
 * - Gracefully handles browsers without clipboard API
 */
function copyToClipboard(text, button) {
  if (!navigator.clipboard) return;

  navigator.clipboard.writeText(text)
    .then(() => {
      const originalText = button.textContent;
      button.textContent = '✓ コピー完了';
      button.disabled = true;
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    })
    .catch(() => {
      button.textContent = '✗ 失敗';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    });
}

// Security: Escape HTML special characters to prevent XSS
// This function converts user-provided strings into safe HTML by escaping:
//   < to &lt;, > to &gt;, & to &amp;, " to &quot;, ' to &#39;
// Used before inserting user content into innerHTML
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------------------- State --------------------
/**
 * Global state object for codebook indexing
 *
 * Structure:
 * - lpp: Lines per page (default: 40)
 * - normCase: Normalize to lowercase (default: true)
 * - normNFKC: Apply NFKC Unicode normalization (default: true)
 * - useRoundRobin: Use round-robin allocation for repeated words (default: true)
 *
 * Data structures:
 * - structure: 3D array [page][line][word] for direct coordinate lookup
 *   Example: structure[0][4][2] = "wolf" (page 1, line 5, word 3 in 1-indexed)
 *
 * - index: Map<word, [{p, l, w}, ...]> for fast word -> coordinates lookup
 *   Example: index.get("wolf") = [{p:1, l:5, w:3}, {p:2, l:3, w:1}]
 *
 * - rr: Map<word, pointer> for round-robin state
 *   Example: rr.get("wolf") = 2 (next use will be 3rd occurrence)
 *
 * - totals: Aggregate statistics for display
 * - normalizedLines: Flat array of all normalized text lines for viewer
 */
const state = {
  ready: false,
  building: false,
  lpp: 40,
  normCase: true,
  normNFKC: true,
  useRoundRobin: true,
  // index structures
  // pages -> lines -> words
  structure: [], // [ [ [word1,word2,...], ...line ], ...page ]
  // fast lookup: normalizedWord -> array of {p,l,w}
  index: new Map(),
  // round-robin pointer for each word
  rr: new Map(),
  totals: { pages: 0, lines: 0, words: 0, unique: 0 },
  // raw normalized lines for viewer reconstruction
  normalizedLines: []
};

// -------------------- Indexing --------------------
/**
 * Build inverted index from reference text
 *
 * Process:
 * 1. Read user settings (lines per page, normalization options)
 * 2. Normalize entire text according to settings
 * 3. Split into lines by newline characters
 * 4. Group lines into pages (based on lines per page setting)
 * 5. Tokenize each line and build:
 *    - structure[page][line][word]: 3D array for coordinate lookup
 *    - index: word -> all coordinates mapping
 * 6. Calculate statistics (pages, lines, words, unique words)
 * 7. Update UI with stats and reset viewer
 *
 * Performance:
 * - Uses setTimeout to prevent UI blocking during indexing
 * - Efficient for texts up to ~5MB
 *
 * Time complexity: O(n) where n is total number of words
 * Space complexity: O(n) for index storage
 */
let book = null;
let revision = 0;
let loadRevision = 0;
let loadController = null;
let authStopped = false;
let snapshot = null;
let statusMessages = new Map();
const copyTasks = new Map();

function t(key, values = {}) {
  const dictionary = BookCodeMessages[document.documentElement.lang] || BookCodeMessages.ja;
  return (dictionary[key] || BookCodeMessages.ja[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

function note(selector, key, values = {}, type = 'info') {
  statusMessages.set(selector, { key, values, type });
  setNote($(selector), t(key, values), type);
}

function resetResult(kind) {
  const encrypting = kind === 'encrypt';
  $(encrypting ? '#cipherOutput' : '#plainOutput').value = '';
  const selector = encrypting ? '#copyCipherBtn' : '#copyPlainBtn';
  copyTasks.delete(selector);
  $(selector).textContent = t('copy');
  $(selector).disabled = true;
  if (encrypting) $('#syncCipherBtn').disabled = true;
  note(encrypting ? '#encryptNotes' : '#decryptNotes', 'changed');
}

function invalidateBook(cancelLoad = true) {
  revision++;
  if (cancelLoad) {
    loadRevision++;
    if (loadController) loadController.abort();
    loadController = null;
    $('#loadStatus').textContent = '';
    statusMessages.delete('#loadStatus');
  }
  book = null;
  snapshot = null;
  state.ready = false;
  state.building = false;
  state.structure = [];
  state.index = new Map();
  state.rr.clear();
  state.totals = { pages: 0, lines: 0, words: 0, unique: 0 };
  $('#stats').textContent = '';
  resetResult('encrypt');
  resetResult('decrypt');
  $('#buildBtn').disabled = false;
  $('#buildBtn').textContent = t('build');
  note('#bookStatus', 'dirty', {}, 'warning');
  renderViewer(1, 1);
  updateEncryptButton();
  updateDecryptButton();
  updatePaginationButtons();
}

function readSnapshot() {
  return [$('#referenceText').value, $('#linesPerPage').value, $('#normalizeCase').checked, $('#normalizeNFKC').checked];
}

function isReady() {
  if (!book || !state.ready || state.building) return false;
  if (JSON.stringify(readSnapshot()) !== JSON.stringify(snapshot)) {
    invalidateBook();
    return false;
  }
  return true;
}

function buildIndex() {
  invalidateBook();
  const ticket = revision;
  const input = readSnapshot();
  state.building = true;
  $('#buildBtn').textContent = t('building');
  $('#buildBtn').disabled = true;
  note('#bookStatus', 'building');
  setTimeout(() => {
    if (ticket !== revision) return;
    try {
      const next = BookCodeCore.buildIndex(input[0], { lpp: input[1], lower: input[2], nfkc: input[3] });
      book = next;
      Object.assign(state, next);
      state.rr = new Map();
      state.useRoundRobin = $('#useRoundRobin').checked;
      snapshot = input;
      state.ready = true;
      $('#stats').textContent = t('stats', state.totals);
      $('#viewPage').value = 1;
      $('#viewLine').value = 1;
      note('#bookStatus', 'ready', {}, 'success');
      renderViewer(1, 1);
    } catch (error) {
      const key = 'error_' + error.message;
      note('#bookStatus', BookCodeMessages.ja[key] ? key : 'error_unknown', {}, 'error');
    } finally {
      state.building = false;
      $('#buildBtn').textContent = t('build');
      $('#buildBtn').disabled = false;
      updateEncryptButton();
      updateDecryptButton();
    }
  }, 50);
}

/**
 * Display styled notification message
 * @param {HTMLElement} element - Note container element
 * @param {string} message - Message text to display
 * @param {string} type - Style type: 'info', 'success', 'warning', 'error' (default: '')
 *
 * Used for showing feedback in encrypt/decrypt operations
 */
function setNote(element, message, type = '') {
  element.textContent = message;
  element.className = 'notes';
  if (type) element.classList.add(type);
}

// -------------------- Encrypt --------------------
/**
 * Encrypt plaintext to page:line:word coordinates
 *
 * Algorithm:
 * 1. Normalize plaintext using same settings as index
 * 2. Tokenize into words
 * 3. For each word:
 *    a. Look up in index
 *    b. If not found: output {???}
 *    c. If found and round-robin ON: cycle through all occurrences
 *    d. If found and round-robin OFF: always use first occurrence
 * 4. Format as "p:l:w" coordinates
 *
 * Round-robin behavior:
 * - Maintains a pointer (rr Map) for each word
 * - Cycles through all available coordinates to reduce pattern
 * - Example: "the" appears 100 times → uses all 100 coordinates in rotation
 *
 * Security note:
 * - Round-robin ON improves resistance to frequency analysis
 * - Round-robin OFF makes cipher vulnerable to frequency attacks
 */
function encrypt() {
  resetResult('encrypt');
  if (!isReady()) { note('#encryptNotes', 'needBuild', {}, 'warning'); return; }
  try {
    const result = BookCodeCore.encode(book, $('#plainInput').value, state.useRoundRobin, state.rr);
    state.rr = result.pointers;
    $('#cipherOutput').value = result.text;
    updateCopyCipherButton();
    $('#syncCipherBtn').disabled = false;
    if (result.missing.length) {
      note('#encryptNotes', 'missing', { n: result.missing.length, words: result.missing.slice(0, 10).join(', ') }, 'warning');
    } else note('#encryptNotes', 'encoded', { n: result.count }, 'success');
  } catch (error) {
    note('#encryptNotes', BookCodeMessages.ja['error_' + error.message] ? 'error_' + error.message : 'error_unknown', {}, 'error');
  }
}

// -------------------- Sync Cipher --------------------
/**
 * Transfer cipher text from encrypt tab to decrypt tab
 *
 * Purpose: Quick workflow for testing encrypt -> decrypt round-trip
 * Triggered by "↓ 同期" button in decrypt tab
 */
function syncCipher() {
  const cipherText = $('#cipherOutput').value;
  if (cipherText.trim()) {
    $('#cipherInput').value = cipherText;
    resetResult('decrypt');
    $('#cipherInput').focus();
    // Trigger input event to enable decrypt button
    updateDecryptButton();
  }
}

// -------------------- Button State Control --------------------
/**
 * Button state management functions
 *
 * Purpose: Disable buttons when there's no input/output to operate on
 * Improves UX by preventing errors from empty operations
 *
 * All functions follow same pattern:
 * 1. Check if relevant textarea has content
 * 2. Enable button if content exists, disable if empty
 */
function updateEncryptButton() {
  const plainInput = $('#plainInput').value.trim();
  $('#encryptBtn').disabled = !plainInput || !state.ready || state.building;
}

function updateDecryptButton() {
  const cipherInput = $('#cipherInput').value.trim();
  $('#decryptBtn').disabled = !cipherInput || !state.ready || state.building;
}

function updateCopyCipherButton() {
  const cipherOutput = $('#cipherOutput').value.trim();
  $('#copyCipherBtn').disabled = !cipherOutput;
}

function updateCopyPlainButton() {
  const plainOutput = $('#plainOutput').value.trim();
  $('#copyPlainBtn').disabled = !plainOutput;
}

// -------------------- Decrypt --------------------
/**
 * Decrypt page:line:word coordinates to plaintext
 *
 * Algorithm:
 * 1. Parse cipher text into [p, l, w] triples
 * 2. For each triple:
 *    a. Validate format (must be p:l:w with digits)
 *    b. Look up in structure[p-1][l-1][w-1] (convert to 0-indexed)
 *    c. If out of range or invalid: output [?]
 * 3. Join words with spaces
 *
 * Error handling:
 * - Invalid format: "abc" → [?]
 * - Out of range: "999:999:999" → [?]
 * - Counts errors and displays warning
 *
 * Note: Decryption always succeeds if coordinates are valid,
 * regardless of normalization settings (uses pre-normalized structure)
 */
function decrypt() {
  resetResult('decrypt');
  if (!isReady()) { note('#decryptNotes', 'needBuild', {}, 'warning'); return; }
  try {
    const result = BookCodeCore.decode(book, $('#cipherInput').value);
    $('#plainOutput').value = result.text;
    updateCopyPlainButton();
    if (result.bad) note('#decryptNotes', 'badCodes', { n: result.bad }, 'error');
    else note('#decryptNotes', 'decoded', {}, 'success');
  } catch (error) {
    note('#decryptNotes', BookCodeMessages.ja['error_' + error.message] ? 'error_' + error.message : 'error_unknown', {}, 'error');
  }
}

// -------------------- Viewer --------------------
/**
 * Render codebook viewer with clickable words
 * @param {number} pageNum - Page number to display (1-indexed)
 * @param {number} lineNum - Line number (currently unused, kept for future use)
 *
 * Features:
 * - Shows one page at a time
 * - Each line prefixed with [p:l] coordinate
 * - Words are clickable to show all occurrences
 * - Pagination buttons for navigation
 *
 * Word click behavior:
 * - Highlights clicked word
 * - Shows all coordinates where this word appears
 * - Highlights current coordinate in the list
 */
function renderViewer(pageNum, lineNum) {
  if (state.structure.length === 0) {
    $('#viewer').textContent = 'インデックス未構築です。まずは「インデックス構築」を実行してください。';
    $('#viewerSelection').classList.add('hidden');
    return;
  }
  const p = Math.max(1, Math.min(pageNum, state.totals.pages));
  const page = state.structure[p - 1];
  if (!page) {
    $('#viewer').textContent = '範囲外のページです。';
    $('#viewerSelection').classList.add('hidden');
    return;
  }

  // Clear previous selection when changing pages
  $('#viewerSelection').classList.add('hidden');

  // Update page input to reflect actual page shown
  $('#viewPage').value = p;

  const linesHtml = page.map((words, idx) => {
    const ln = idx + 1;
    const spans = words.map((w, wi) => `<span class="word" data-p="${p}" data-l="${ln}" data-w="${wi+1}">${escapeHtml(w)}</span>`).join(' ');
    return `<div class="line"><span class="line-number">[${p}:${ln}]</span> ${spans}</div>`;
  }).join('\n');

  $('#viewer').innerHTML = linesHtml;

  // Click to highlight a word (simulate selection)
  $('#viewer').querySelectorAll('.word').forEach(el => {
    el.addEventListener('click', () => {
      $('#viewer').querySelectorAll('.word').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      const p = el.getAttribute('data-p');
      const l = el.getAttribute('data-l');
      const w = el.getAttribute('data-w');
      const word = el.textContent;
      const clickedCoord = `${p}:${l}:${w}`;

      // Get all occurrences of this word from the index
      const allOccurrences = state.index.get(word) || [];

      const selectionEl = $('#viewerSelection');
      if (allOccurrences.length === 0) {
        selectionEl.textContent = `選択: ${clickedCoord} → "${word}" (インデックスに未登録)`;
      } else if (allOccurrences.length === 1) {
        selectionEl.innerHTML = `選択: <strong>${clickedCoord}</strong> → <strong>"${escapeHtml(word)}"</strong> (この単語は1箇所のみ出現)`;
      } else {
        // Multiple occurrences - show all coordinates
        const coordList = allOccurrences.map(loc => {
          const coord = `${loc.p}:${loc.l}:${loc.w}`;
          return coord === clickedCoord
            ? `<strong class="coord-highlight">${coord}</strong>`
            : coord;
        }).join(', ');
        selectionEl.innerHTML = `選択: <strong>"${escapeHtml(word)}"</strong> → ${allOccurrences.length}箇所に出現<br>` +
                                `座標: ${coordList}`;
      }
      selectionEl.classList.remove('hidden');
    });
  });

  // Update pagination button states
  updatePaginationButtons();
}

function updatePaginationButtons() {
  const currentPage = parseInt($('#viewPage').value) || 1;
  const prevBtn = $('#prevPageBtn');
  const nextBtn = $('#nextPageBtn');

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= state.totals.pages;
  }
}

// -------------------- Tabs --------------------
/**
 * Setup tab navigation
 *
 * Pattern: Single-page app with tab-based UI
 * - Only one tab active at a time
 * - Tab buttons use data-tab attribute to identify target content
 * - Active class controls visibility via CSS
 */
function setupTabs() {
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      $$('.tab').forEach(b => b.classList.remove('active'));
      $$('.tabcontent').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`#${tabId}`).classList.add('active');
    });
  });
}

// -------------------- Plaintext Presets --------------------
/**
 * Sample plaintext for quick testing
 *
 * Preset 1: Short message (5 words)
 * Preset 2: Medium message (10 words) - spy scenario
 * Preset 3: Long message (28 words) - from Aesop's Fables
 */
const PLAINTEXT_PRESETS = {
  1: "this is a secret message",
  2: "meet me at the old bridge tonight at ten",
  3: "the wolf resolved not to lay violent hands on the lamb but to find some plea to justify the right to eat him"
};

/**
 * Load sample plaintext into encrypt tab
 * @param {number} presetId - Preset number (1-3)
 */
function setPlaintextPreset(presetId) {
  const text = PLAINTEXT_PRESETS[presetId];
  if (text) {
    $('#plainInput').value = text;
    resetResult('encrypt');
    $('#plainInput').focus();
    updateEncryptButton();
  }
}

// -------------------- Sample Reference --------------------
/**
 * Fallback sample text when no presets are available
 *
 * Source: "The Wolf and the Lamb" from Aesop's Fables
 * - Classic fable with moral lesson
 * - Good word variety for testing
 * - Contains repeated words for round-robin testing
 * - ~100 words, suitable for demonstration
 */
const SAMPLE = `The Project Gutenberg eBook of Aesop's Fables.

A WOLF, meeting with a Lamb astray from the fold, resolved not to lay violent hands on him, but to find some plea to justify to the Lamb the Wolf's right to eat him. He thus addressed him: "Sirrah, last year you grossly insulted me." "Indeed," bleated the Lamb in a mournful tone of voice, "I was not then born." Then said the Wolf, "You feed in my pasture." "No, good sir," replied the Lamb, "I have not yet tasted grass." Again said the Wolf, "You drink of my well." "No," exclaimed the Lamb, "I never yet drank water, for as yet my mother's milk is both food and drink to me." Upon which the Wolf seized him and ate him up, saying, "Well! I won't remain supperless, even though you refute every one of my imputations."

MORAL: The tyrant will always find a pretext for his tyranny.`;

// -------------------- Codebook Presets --------------------
/**
 * Load codebook preset metadata from manifest.json
 * @returns {Promise<Array>} Array of codebook definitions
 *
 * Manifest format:
 * {
 *   "codebooks": [
 *     {
 *       "id": "unique-id",
 *       "title": "Display title",
 *       "filename": "file.txt",
 *       "description": "Tooltip text",
 *       "source": "Source name (optional)",
 *       "sourceUrl": "Source URL (optional)"
 *     }
 *   ]
 * }
 *
 * Returns empty array if manifest doesn't exist or fails to load
 */
async function fetchText(url, controller, limit) {
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (response.status === 401) { authStopped = true; throw new Error('authStop'); }
    if (!response.ok) throw new Error('loadFailed');
    if (Number(response.headers.get('Content-Length')) > limit * 4) throw new Error('textLimit');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (text.length > limit) throw new Error('textLimit');
      }
      text += decoder.decode();
      if (text.length > limit) throw new Error('textLimit');
      return text;
    } finally { await reader.cancel(); }
  } finally { clearTimeout(timeout); }
}

async function loadCodebookManifest() {
  if (location.protocol === 'file:') { note('#loadStatus', 'fileMode'); return []; }
  if (authStopped) return [];
  try {
    const data = JSON.parse(await fetchText('data/manifest.json', new AbortController(), 100000));
    if (!Array.isArray(data.codebooks) || data.codebooks.length > 50) throw new Error('catalogFailed');
    const ids = new Set();
    for (const entry of data.codebooks) {
      if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id) ||
          ids.has(entry.id) || typeof entry.title !== 'string' || entry.title.length > 200 ||
          !BookCodeCore.validateFilename(entry.filename)) throw new Error('catalogFailed');
      ids.add(entry.id);
    }
    return data.codebooks;
  } catch (error) {
    note('#loadStatus', authStopped ? 'authStop' : 'catalogFailed', {}, 'warning');
    return [];
  }
}

function validateFilename(filename) {
  return BookCodeCore.validateFilename(filename);
}

async function loadCodebook(filename) {
  if (authStopped) { note('#loadStatus', 'authStop', {}, 'error'); return; }
  if (!validateFilename(filename)) { note('#loadStatus', 'loadFailed', {}, 'error'); return; }
  invalidateBook();
  const ticket = loadRevision;
  const controller = new AbortController();
  loadController = controller;
  note('#loadStatus', 'loading');
  try {
    const text = await fetchText('data/' + encodeURIComponent(filename), controller, BookCodeCore.LIMITS.reference);
    if (ticket !== loadRevision) return;
    // Validate before replacing the user's text.
    BookCodeCore.buildIndex(text, { lpp: $('#linesPerPage').value,
      lower: $('#normalizeCase').checked, nfkc: $('#normalizeNFKC').checked });
    $('#referenceText').value = text.replace(/\r\n?/g, '\n');
    loadController = null;
    buildIndex();
    note('#loadStatus', 'loaded', {}, 'success');
  } catch (error) {
    if (ticket !== loadRevision) return;
    note('#loadStatus', authStopped ? 'authStop' : 'loadFailed', {}, 'error');
  } finally {
    if (ticket === loadRevision) loadController = null;
  }
}

async function setupCodebookPresets() {
  const codebooks = await loadCodebookManifest();
  const container = $('#codebookPresets');
  container.classList.toggle('hidden', codebooks.length === 0);
  codebooks.forEach(entry => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.dataset.book = entry.id;
    btn.textContent = entry.title;
    btn.addEventListener('click', () => loadCodebook(entry.filename));
    container.appendChild(btn);
  });
  return codebooks[0] || null;
}

// -------------------- Init --------------------
/**
 * Initialize application on page load
 *
 * Initialization sequence:
 * 1. Setup codebook presets from manifest
 * 2. Auto-load first preset (or fallback to SAMPLE)
 * 3. Build initial index
 * 4. Bind all event listeners:
 *    - Button clicks (build, encrypt, decrypt, copy, sync, view, pagination)
 *    - Input monitoring (for button state management)
 *    - Keyboard shortcuts (Enter, Ctrl+Enter)
 * 5. Setup tab navigation
 * 6. Render initial viewer page
 *
 * Note: All async operations use await to ensure proper sequencing
 */
async function init() {
  $('#referenceText').value = SAMPLE;
  buildIndex();

  // Bind controls
  $('#buildBtn').addEventListener('click', buildIndex);
  $('#encryptBtn').addEventListener('click', encrypt);
  $('#decryptBtn').addEventListener('click', decrypt);

  // Preset buttons
  $$('#encryptTab .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetId = btn.getAttribute('data-preset');
      setPlaintextPreset(presetId);
    });
  });

  // Copy buttons with feedback
  $('#copyCipherBtn').addEventListener('click', (e) => {
    copyToClipboard($('#cipherOutput').value, e.target);
  });
  $('#copyPlainBtn').addEventListener('click', (e) => {
    copyToClipboard($('#plainOutput').value, e.target);
  });

  // Sync cipher button
  $('#syncCipherBtn').addEventListener('click', syncCipher);

  // Input monitoring for button states
  $('#plainInput').addEventListener('input', () => { resetResult('encrypt'); updateEncryptButton(); });
  $('#cipherInput').addEventListener('input', () => { resetResult('decrypt'); updateDecryptButton(); });
  ['referenceText', 'linesPerPage', 'normalizeCase', 'normalizeNFKC'].forEach(id => {
    $('#' + id).addEventListener('input', () => invalidateBook());
  });
  $('#useRoundRobin').addEventListener('change', () => {
    state.useRoundRobin = $('#useRoundRobin').checked;
    state.rr.clear();
    resetResult('encrypt');
  });

  // Viewer controls
  $('#viewBtn').addEventListener('click', () => {
    const p = +$('#viewPage').value || 1;
    const l = +$('#viewLine').value || 1;
    renderViewer(p, l);
  });

  // Pagination buttons
  $('#prevPageBtn').addEventListener('click', () => {
    const currentPage = parseInt($('#viewPage').value) || 1;
    if (currentPage > 1) {
      renderViewer(currentPage - 1, 1);
    }
  });

  $('#nextPageBtn').addEventListener('click', () => {
    const currentPage = parseInt($('#viewPage').value) || 1;
    if (currentPage < state.totals.pages) {
      renderViewer(currentPage + 1, 1);
    }
  });

  // Enter key support
  $('#viewPage').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      $('#viewBtn').click();
    }
  });
  $('#viewLine').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      $('#viewBtn').click();
    }
  });
  $('#linesPerPage').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      $('#buildBtn').click();
    }
  });
  $('#plainInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      $('#encryptBtn').click();
    }
  });
  $('#cipherInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      $('#decryptBtn').click();
    }
  });

  // Tabs
  setupTabs();

  // Do not replace text if the user has already edited it during manifest loading.
  const ticket = revision;
  const firstPreset = await setupCodebookPresets();
  if (firstPreset && ticket === revision) await loadCodebook(firstPreset.filename);
}

// Run after DOM ready
document.addEventListener('DOMContentLoaded', init);

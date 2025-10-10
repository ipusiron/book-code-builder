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
function normalizeText(str, { lower = true, nfkc = true } = {}) {
  let s = str;
  if (nfkc && s.normalize) s = s.normalize('NFKC');
  if (lower) s = s.toLowerCase();
  return s;
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
  return (line.match(WORD_RE) || []);
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
function parseCodeTokens(s) {
  // Accept separators: space, comma, semicolon, newline
  const raw = s.split(/[\s,;]+/).filter(Boolean);
  const triples = [];
  for (const t of raw) {
    const m = t.match(/^(\d+):(\d+):(\d+)$/);
    if (!m) { triples.push(null); continue; }
    triples.push([+m[1], +m[2], +m[3]]);
  }
  return triples;
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
function buildIndex() {
  const btn = $('#buildBtn');
  const originalText = btn.textContent;
  btn.textContent = '構築中...';
  btn.disabled = true;

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    state.lpp = Math.max(1, +$('#linesPerPage').value || 40);
    state.normCase = $('#normalizeCase').checked;
    state.normNFKC = $('#normalizeNFKC').checked;
    state.useRoundRobin = $('#useRoundRobin').checked;

    const raw = $('#referenceText').value;
    const normalizedAll = normalizeText(raw, { lower: state.normCase, nfkc: state.normNFKC });

    const lines = normalizedAll.split(/\r?\n/);
    state.normalizedLines = lines.slice();

    // Group lines into pages of LPP
    const pages = [];
    for (let i = 0; i < lines.length; i += state.lpp) {
      pages.push(lines.slice(i, i + state.lpp));
    }

    // Build structure and index
    state.structure = [];
    state.index.clear();
    state.rr.clear();

    let totalLines = 0;
    let totalWords = 0;

    pages.forEach((pageLines, pIdx) => {
      const linesArr = [];
      pageLines.forEach((ln, lIdx) => {
        const words = tokenize(ln);
        totalLines += 1;
        totalWords += words.length;

        // Record positions
        words.forEach((w, wIdx) => {
          const key = w; // already normalized
          const loc = { p: pIdx + 1, l: lIdx + 1, w: wIdx + 1 };
          if (!state.index.has(key)) state.index.set(key, []);
          state.index.get(key).push(loc);
        });

        linesArr.push(words);
      });
      state.structure.push(linesArr);
    });

    const unique = state.index.size;
    state.totals = {
      pages: pages.length,
      lines: totalLines,
      words: totalWords,
      unique
    };

    // Update stats with improved design
    const stats = $('#stats');
    stats.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">📄 ページ数: <strong>${state.totals.pages}</strong></div>
        <div class="stat-item">📝 行数: <strong>${state.totals.lines}</strong></div>
        <div class="stat-item">💬 単語数: <strong>${state.totals.words}</strong></div>
        <div class="stat-item">✨ ユニーク: <strong>${state.totals.unique}</strong></div>
      </div>
    `;

    // Reset viewer default to 1:1
    $('#viewPage').value = 1;
    $('#viewLine').value = 1;

    // Notes with proper styling
    setNote($('#encryptNotes'), '未収録語は {???} で出力します。語の多重出現はラウンドロビンで割当。', 'info');
    setNote($('#decryptNotes'), '不正なトークンや範囲外は [?] として出力します。', 'info');

    // Refresh viewer first page
    renderViewer(1, 1);

    // Restore button
    btn.textContent = originalText;
    btn.disabled = false;
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
  const srcRaw = $('#plainInput').value;
  if (!srcRaw.trim()) {
    $('#cipherOutput').value = '';
    updateCopyCipherButton();
    $('#syncCipherBtn').disabled = true;
    setNote($('#encryptNotes'), '入力が空です。', 'warning');
    return;
  }
  if (state.structure.length === 0) buildIndex();

  const norm = normalizeText(srcRaw, { lower: state.normCase, nfkc: state.normNFKC });
  const words = tokenize(norm);

  const codes = [];
  const missing = [];

  for (const w of words) {
    const locs = state.index.get(w);
    if (!locs || locs.length === 0) {
      codes.push('{???}');
      missing.push(w);
    } else {
      let loc;
      if (state.useRoundRobin) {
        // Round-robin pick: cycle through all occurrences
        const ptr = state.rr.get(w) || 0;
        loc = locs[ptr % locs.length];
        state.rr.set(w, ptr + 1);
      } else {
        // Always use the first occurrence
        loc = locs[0];
      }
      codes.push(`${loc.p}:${loc.l}:${loc.w}`);
    }
  }

  $('#cipherOutput').value = codes.join(' ');

  // Update button states
  updateCopyCipherButton();
  const syncBtn = $('#syncCipherBtn');
  if (syncBtn && codes.length > 0) {
    syncBtn.disabled = false;
  }

  if (missing.length) {
    const noteEl = $('#encryptNotes');
    noteEl.innerHTML = `未収録語（${missing.length}）: <code>${escapeHtml(missing.slice(0, 10).join(', '))}${missing.length>10?' …':''}</code>`;
    noteEl.className = 'notes warning';
  } else {
    setNote($('#encryptNotes'), 'すべて符号化できました。', 'success');
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
  $('#encryptBtn').disabled = !plainInput;
}

function updateDecryptButton() {
  const cipherInput = $('#cipherInput').value.trim();
  $('#decryptBtn').disabled = !cipherInput;
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
  const cipherRaw = $('#cipherInput').value;
  if (!cipherRaw.trim()) {
    $('#plainOutput').value = '';
    updateCopyPlainButton();
    setNote($('#decryptNotes'), '入力が空です。', 'warning');
    return;
  }
  if (state.structure.length === 0) buildIndex();

  const triples = parseCodeTokens(cipherRaw);
  const out = [];
  let bad = 0;

  for (const t of triples) {
    if (!t) { out.push('[?]'); bad++; continue; }
    const [p, l, w] = t;
    const page = state.structure[p - 1];
    if (!page) { out.push('[?]'); bad++; continue; }
    const line = page[l - 1];
    if (!line) { out.push('[?]'); bad++; continue; }
    const word = line[w - 1];
    if (!word) { out.push('[?]'); bad++; continue; }
    out.push(word);
  }

  $('#plainOutput').value = out.join(' ');

  // Update copy button state
  updateCopyPlainButton();

  if (bad) {
    setNote($('#decryptNotes'), `警告：${bad} トークンが不正/範囲外です。`, 'error');
  } else {
    setNote($('#decryptNotes'), '復号に成功しました。', 'success');
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
async function loadCodebookManifest() {
  try {
    const response = await fetch('data/manifest.json');
    if (!response.ok) {
      console.warn('manifest.json not found or error loading');
      return [];
    }
    const data = await response.json();
    return data.codebooks || [];
  } catch (err) {
    console.error('Failed to load manifest:', err);
    return [];
  }
}

// Security: Validate filename to prevent path traversal attacks
function validateFilename(filename) {
  // Only allow alphanumeric, spaces, hyphens, underscores, and .txt extension
  // Reject any path separators (/, \), parent directory references (..), or other suspicious patterns
  const safePattern = /^[a-zA-Z0-9\s\-_']+\.txt$/;
  if (!safePattern.test(filename)) {
    console.error('Invalid filename detected:', filename);
    return false;
  }
  // Additional check: no path separators
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    console.error('Path traversal attempt detected:', filename);
    return false;
  }
  return true;
}

/**
 * Load codebook text file from data/ folder
 * @param {string} filename - Filename (e.g., "file.txt")
 * @returns {Promise<string|null>} File content or null on error
 *
 * Security:
 * - Validates filename before fetching (prevents path traversal)
 * - Only allows alphanumeric + spaces + hyphens + underscores
 * - Rejects "..", "/", "\" characters
 * - Shows user-friendly error messages
 */
async function loadCodebook(filename) {
  // Security: Validate filename before fetching
  if (!validateFilename(filename)) {
    alert(`セキュリティ上の理由でファイル名が拒否されました: ${filename}`);
    return null;
  }

  try {
    const response = await fetch(`data/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}`);
    }
    const text = await response.text();
    return text;
  } catch (err) {
    console.error('Failed to load codebook:', err);
    alert(`コードブックの読み込みに失敗しました: ${filename}`);
    return null;
  }
}

/**
 * Setup codebook preset buttons from manifest
 * @returns {Promise<Object|null>} First codebook definition or null
 *
 * Process:
 * 1. Load manifest.json
 * 2. Create button for each codebook
 * 3. Button click → load file → auto-build index
 * 4. Show loading state during file fetch
 * 5. Return first codebook for auto-loading on init
 *
 * UI:
 * - Buttons show title from manifest
 * - Tooltip shows description (if provided)
 * - Loading indicator during fetch
 */
async function setupCodebookPresets() {
  const codebooks = await loadCodebookManifest();

  if (codebooks.length === 0) {
    // No presets available, hide the preset area
    $('#codebookPresets').classList.add('hidden');
    return null;
  }

  const container = $('#codebookPresets');
  container.classList.remove('hidden');

  // Create buttons for each codebook
  codebooks.forEach(book => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = book.title;
    if (book.description) {
      btn.title = book.description;
    }
    btn.addEventListener('click', async () => {
      const originalText = btn.textContent;
      btn.textContent = '読み込み中...';
      btn.disabled = true;

      const text = await loadCodebook(book.filename);
      if (text) {
        $('#referenceText').value = text;
        $('#referenceText').focus();
        // Auto-build index after loading
        buildIndex();
      }

      btn.textContent = originalText;
      btn.disabled = false;
    });
    container.appendChild(btn);
  });

  // Return the first codebook for auto-loading
  return codebooks.length > 0 ? codebooks[0] : null;
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
  // Setup codebook presets first
  const firstPreset = await setupCodebookPresets();

  // Load the first preset if available, otherwise use SAMPLE
  if (firstPreset) {
    const text = await loadCodebook(firstPreset.filename);
    if (text) {
      $('#referenceText').value = text;
    } else {
      // Fallback to SAMPLE if loading fails
      $('#referenceText').value = SAMPLE;
    }
  } else {
    // No presets available, use SAMPLE
    $('#referenceText').value = SAMPLE;
  }

  // Build once
  buildIndex();

  // Bind controls
  $('#buildBtn').addEventListener('click', buildIndex);
  $('#encryptBtn').addEventListener('click', encrypt);
  $('#decryptBtn').addEventListener('click', decrypt);

  // Preset buttons
  $$('.preset-btn').forEach(btn => {
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
  $('#plainInput').addEventListener('input', updateEncryptButton);
  $('#cipherInput').addEventListener('input', updateDecryptButton);

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

  // Render initial viewer
  renderViewer(1, 1);
}

// Run after DOM ready
document.addEventListener('DOMContentLoaded', init);

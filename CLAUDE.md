# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Book Code Builder** is a web-based educational tool for exploring historical book codes (cipher systems that use text as a codebook). Users encode plaintext into `page:line:word` coordinates and decode these coordinates back to plaintext.

This is a pure client-side application (HTML/CSS/JavaScript) with no build process or dependencies. It runs entirely in the browser and is deployed via GitHub Pages.

## Running the Application

Open `index.html` directly in a browser:
```bash
start index.html
```

No build, compilation, or server required. All functionality is self-contained.

## Architecture

### Core Data Structures (script.js)

**State object** (`state` at script.js:66-81):
- `structure`: 3D array `[page][line][word]` representing the indexed codebook
- `index`: Map of `normalizedWord -> [{p, l, w}, ...]` for fast encoding lookups
- `rr`: Round-robin pointer Map for words appearing multiple times
- `useRoundRobin`: Boolean flag to enable/disable round-robin allocation (default: true)
- `normalizedLines`: Flat array of normalized text lines for viewer reconstruction
- `totals`: Aggregate statistics (pages, lines, words, unique words)

### Key Algorithms

**Indexing** (`buildIndex()` at script.js:66-135):
1. Splits reference text into lines
2. Groups lines into pages based on `Lines Per Page` (default 40)
3. Tokenizes each line using Unicode-aware regex (`WORD_RE` at script.js:20)
4. Builds inverted index mapping normalized words to all `{p, l, w}` positions
5. Normalizes text per user settings (case folding, NFKC)

**Encoding** (`encrypt()` at script.js:179-223):
- Tokenizes plaintext input
- Looks up each word in the index
- If `state.useRoundRobin` is true:
  - Uses **round-robin allocation** for words with multiple occurrences (prevents pattern bias)
  - Cycles through all available coordinates for each word
- If `state.useRoundRobin` is false:
  - Always uses the first occurrence coordinate (vulnerable to frequency analysis)
- Outputs `{???}` for words not found in codebook

**Decoding** (`decode()` at script.js:176-207):
- Parses `p:l:w` tokens from input (accepts space/comma/semicolon/newline separators)
- Looks up each coordinate in the 3D structure
- Outputs `[?]` for invalid or out-of-range coordinates

**Tokenization** (`WORD_RE` at script.js:20):
```javascript
/[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu
```
Matches Unicode letters/numbers with optional internal hyphens/apostrophes (e.g., "don't", "co-operate", "abc123").

### UI Flow

1. **Reference Text panel**:
   - User can select from **codebook presets** (loaded from `data/` folder via `manifest.json`)
   - Or paste custom codebook text manually
   - Adjusts normalization settings, clicks "Build Index"
2. **Encrypt tab**: Input plaintext → outputs space-separated `p:l:w` codes
3. **Decrypt tab**: Input `p:l:w` codes → outputs reconstructed plaintext
4. **Viewer tab**: Interactive page/line browser with click-to-highlight word selection
5. **Help tab**: Usage instructions

Tab switching handled by `setupTabs()` (script.js:330-340).

## Code Conventions

- **Utilities**: `$()` for `querySelector`, `$$()` for `querySelectorAll` (script.js:8-9)
- **Normalization**: Controlled by checkboxes, applied via `normalizeText()` (script.js:11-16)
- **Sample data**: Default Aesop's Fable text loaded on init (`SAMPLE` at script.js:358-362)
- **Codebook presets**: Loaded from `data/manifest.json` via `setupCodebookPresets()` (script.js:395-433)
  - Preset buttons dynamically generated based on manifest
  - Clicking a preset loads the text file and auto-builds the index
- **XSS prevention**: User input escaped via `escapeHtml()` before innerHTML (script.js:59-63)

## Testing

No automated tests. Manual testing via browser:
1. Verify encoding → decoding round-trip produces original text
2. Test edge cases: words not in codebook, invalid coordinates, empty input
3. Check round-robin behavior with repeated words
4. Test normalization toggles (case/NFKC)
5. Verify viewer page navigation and word highlighting
6. Test codebook presets:
   - Add entries to `data/manifest.json` and corresponding `.txt` files
   - Verify preset buttons appear on page load
   - Verify clicking a preset loads the text and builds the index automatically
   - Test with missing/invalid files (should show error alert)

## Deployment

GitHub Pages deployment:
- `.nojekyll` file prevents Jekyll processing
- Push to `main` branch automatically updates https://ipusiron.github.io/book-code-builder/

## Directory Structure

```
book-code-builder/
├── index.html          # Main HTML file
├── script.js           # JavaScript logic
├── style.css           # Styles
├── README.md           # Project documentation
├── CLAUDE.md           # This file
├── .gitignore          # Git ignore rules
├── .nojekyll           # GitHub Pages config
└── data/               # Codebook presets
    ├── manifest.json   # Preset definitions
    ├── README.md       # How to add presets
    └── *.txt           # Codebook text files
```

**Adding Codebook Presets:**
1. Place text file in `data/` folder (e.g., `data/aesops-fables.txt`)
2. Add entry to `data/manifest.json`:
   ```json
   {
     "codebooks": [
       {
         "id": "aesops-fables",
         "title": "Aesop's Fables",
         "filename": "aesops-fables.txt",
         "description": "Classic fables",
         "source": "Project Gutenberg",
         "sourceUrl": "https://www.gutenberg.org/ebooks/11339"
       }
     ]
   }
   ```
   - Required fields: `id`, `title`, `filename`
   - Optional fields: `description` (shown as tooltip), `source`, `sourceUrl` (for management only, not displayed in UI)
3. Reload page - preset button will appear automatically

## Historical Context (from README.md)

Book codes were used for espionage/diplomatic communication in the 19th-20th centuries. The tool simulates:
- **Version sensitivity**: Different editions/printings break compatibility (simulated via normalization settings)
- **Coverage limitations**: Words not in codebook cannot be encoded (shown as `{???}`)
- **Ambiguity**: Frequent words have multiple valid coordinates (handled via round-robin)

This is an **educational/research tool**, not for production cryptography.

## Known Limitations

- Line-based page splitting (not physical book pages)
- No punctuation encoding (only words)
- Case/NFKC normalization must match between encoder/decoder
- No persistence (state lost on page reload)

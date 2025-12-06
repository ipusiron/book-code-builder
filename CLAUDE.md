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

**State object** (`state` at script.js:177-192):
- `structure`: 3D array `[page][line][word]` for coordinate-to-word lookup (0-indexed internally, 1-indexed in UI)
- `index`: Map of `normalizedWord -> [{p, l, w}, ...]` for word-to-coordinates lookup
- `rr`: Round-robin pointer Map tracking next coordinate to use for each word
- `useRoundRobin`: Boolean flag to enable/disable round-robin allocation (default: true)
- `normalizedLines`: Flat array of normalized text lines for viewer reconstruction
- `totals`: Aggregate statistics (pages, lines, words, unique words)

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `buildIndex()` | script.js:216-303 | Builds inverted index from reference text |
| `encrypt()` | script.js:342-395 | Encodes plaintext to p:l:w coordinates |
| `decrypt()` | script.js:465-501 | Decodes p:l:w coordinates to plaintext |
| `renderViewer()` | script.js:520-584 | Displays codebook with clickable words |
| `normalizeText()` | script.js:50-55 | Applies case folding and NFKC normalization |
| `tokenize()` | script.js:82-84 | Extracts words using Unicode-aware regex |
| `escapeHtml()` | script.js:148-152 | XSS prevention for innerHTML |
| `validateFilename()` | script.js:700-714 | Path traversal prevention |

### Key Regex

**Word tokenization** (`WORD_RE` at script.js:75):
```javascript
/[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu
```
Matches Unicode letters/numbers with optional internal hyphens/apostrophes (e.g., "don't", "co-operate", "abc123").

### UI Flow

1. **Reference Text panel**: Select codebook preset or paste custom text, then "Build Index"
2. **Encrypt tab**: Input plaintext -> outputs space-separated `p:l:w` codes
3. **Decrypt tab**: Input `p:l:w` codes -> outputs reconstructed plaintext
4. **Viewer tab**: Interactive page browser with click-to-highlight word selection
5. **Help tab**: Usage instructions (accordion-style)

## Code Conventions

- **DOM utilities**: `$()` for `querySelector`, `$$()` for `querySelectorAll` (script.js:35-36)
- **XSS prevention**: Always use `escapeHtml()` before innerHTML, prefer `textContent` when possible
- **CSP compliance**: No inline styles or scripts; use CSS classes for dynamic styling
- **Button state**: Functions like `updateEncryptButton()`, `updateDecryptButton()` manage disabled states

## Security Implementation

### Content Security Policy (index.html)
- `script-src 'self'` - No inline scripts or eval
- `style-src 'self'` - No inline styles
- `connect-src 'self'` - Fetch only from same origin

### XSS Prevention
- `escapeHtml()` for all user content before innerHTML
- `textContent` for simple text updates
- `textarea.value` for input/output (no HTML parsing)

### Path Traversal Prevention
- `validateFilename()` allows only: alphanumeric, spaces, hyphens, underscores, apostrophes, `.txt` extension
- Rejects `/`, `\`, `..` characters

## Testing

No automated tests. Manual testing via browser:
1. Verify encoding -> decoding round-trip produces original text
2. Test edge cases: words not in codebook (`{???}`), invalid coordinates (`[?]`), empty input
3. Check round-robin behavior with repeated words
4. Test normalization toggles (case/NFKC)
5. Verify viewer page navigation and word highlighting
6. Test codebook presets loading from `data/manifest.json`

## Deployment

GitHub Pages deployment:
- `.nojekyll` file prevents Jekyll processing
- Push to `main` branch automatically updates https://ipusiron.github.io/book-code-builder/

## Adding Codebook Presets

1. Place text file in `data/` folder (e.g., `data/my-book.txt`)
2. Add entry to `data/manifest.json`:
   ```json
   {
     "id": "my-book",
     "title": "My Book",
     "filename": "my-book.txt",
     "description": "Optional tooltip text"
   }
   ```
3. Reload page - preset button appears automatically

**Recommended file size**: 100KB-5MB. Larger files may cause browser lag.

## Known Limitations

- Line-based page splitting (not physical book pages)
- No punctuation encoding (only words)
- Case/NFKC normalization must match between encoder/decoder
- No persistence (state lost on page reload)
- Round-robin pointer advances each encryption (same plaintext produces different ciphertext)

## Additional Documentation

- **README.md**: Project overview, historical context, usage scenarios (Japanese)
- **TECHNICAL.md**: Detailed algorithm explanations, data structure design, security implementation details (Japanese)

# CLAUDE.md

Shared guidance for coding agents working in this repository.

## Project overview

Book Code Builder is an educational page:line:word codebook simulator.
It is not suitable for protecting secrets. Decoding returns normalized words, not the original punctuation or formatting.
Do not describe round-robin as random, always producing different output, or guaranteeing security.

## Run and test

No build or runtime dependencies. Open index.html directly for the built-in sample and manual input.
The three file-based presets require HTTP serving:

```sh
python -m http.server 8000 --bind 127.0.0.1
npm test
```

Tests require Node.js 22 or later; no npm install is needed.
CI runs npm test on push and pull_request.
Do not add dependencies or change book texts just to make tests pass.

## Architecture

- core.js: UMD/CommonJS pure functions, validation and LIMITS
- learning-samples.js: four immutable paired reference/plaintext examples with explicit settings
- script.js: input snapshot, build/load revisions, clipboard tasks, tabs and viewer
- messages.js: Japanese/English dynamic strings and book titles
- static-messages.js: static UI translations keyed by Japanese source text
- i18n.js: URL/saved/browser language selection, text-node updates and languagechange
- index.html/style.css: semantic controls, system theme and responsive layout

The core returns structure[page][line][word] (zero-based internally), index Map of words to one-based coordinates, normalizedLines and totals.
encode returns a new pointer Map; the caller commits it only on success.
It also returns normalized plaintext, actual selection trace, grouped missingCounts and encodedCount.
compare starts each mode with an empty pointer Map and must never consume normal cycle positions.
The UI snapshot includes the reference text, lines per page and both normalization flags.

## Coordinate convention

Apply NFKC then toLowerCase if enabled. Split LF, CRLF or CR, including blank lines and a final empty line.
Group lines by lpp (integer 1–200, default 40).
Tokenize with:

```javascript
/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu
```

Only ASCII hyphen/apostrophe joins are allowed. A curly apostrophe splits a word; continuous Japanese is not linguistically segmented.
Changing this convention or bundled text changes coordinates and requires explicit compatibility design.

## State invariants

- Editing reference text, lpp or normalization invalidates the index and both results immediately.
- Building and dirty states cannot encode/decode.
- Editing plaintext/ciphertext, samples and sync clears the corresponding stale result.
- Round-robin toggling resets cycle positions and the encoded result.
- Language switching must preserve input, output, snapshot, cycle positions and viewer selection.
- Trace/comparison views are stored results, not re-encodings. Render at most 50 entries per list page.
- Clear learning views with plaintext/reference/settings mutations. Compare must not replace normal output.
- Paired sample selection is preview-only. Apply explicitly replaces reference/plaintext/settings, clears decoding input/results/cycles and rebuilds, cancelling stale loads.
- Old build callbacks or file responses must never overwrite newer input.
- A failed load preserves the input; rebuilding is required.
- Late clipboard completions cannot reactivate invalid results.

## Limits and display

The source of truth is BookCodeCore.LIMITS:
reference 1,000,000 UTF-16 code units, words 100,000, lines 50,000,
plaintext 20,000, ciphertext input/output 100,000, decoded output 1,000,000,
conversion tokens 10,000, lpp 200.
Check lengths after normalization as well as before it.
Reject oversized input/output without partial success or pointer advancement.

Viewer: up to 100 lines / 2,000 words from the requested line.
Word labels: first 120 code units plus ellipsis. Occurrence lists: first 100 coordinates.
Display truncation does not truncate the index or totals.
Computation is synchronous on the main thread; setTimeout is not background processing.

## Security and privacy

Use createElement, textContent, text nodes and textarea.value for user-derived values. Never interpolate input into HTML.
Keep scripts/styles external and preserve the CSP. Do not add ineffective HTTP-header meta tags.
Validate manifest shape, unique ids and filenames; read only data/ filenames via encodeURIComponent.
Reject redirects, bound loading by size and 10-second timeout, use credentials:omit.
After HTTP 401, stop file loading on the current page rather than retrying.

Only the selected UI language is stored. Do not persist or upload reference text, inputs, results or keys.
Storage denial must not break the app.
Clipboard failure must offer a manual selection/copy path.

## Presets and documentation

See data/README.md for source metadata, adding entries and rights notices.
Keep the three .txt files unchanged unless a task explicitly requires a coordinate-affecting text change.
Use the eBook id printed in each file for source URLs.
Descriptions/source fields are maintenance metadata, not UI tooltips.
Add localized book titles to messages.js.

Maintain full README.md / README.en.md section and example parity.
Keep warnings equally strong in both languages.
Use actual core results for examples; a flag with punctuation is not restored automatically.
Update screenshots when the UI changes, preserving backups before overwriting.

## Browser verification

Check Chromium and Firefox over HTTP and file URLs, Japanese/English, light/dark,
320/390/768/1280px, keyboard tabs and word buttons, delayed/failed loading,
storage denial, clipboard rejection and language switching after results.
Report Safari, physical-device and screen-reader checks as unverified unless actually run.

## Deployment

GitHub Pages serves main at https://ipusiron.github.io/book-code-builder/.
.nojekyll disables Jekyll processing.
Use a work branch and PR; verify CI before ordinary merge, then verify the deployed files and UI.
Do not force-push or rewrite shared history.

## Further documentation

- README.md / README.en.md: scope, examples, limitations and usage
- TECHNICAL.md: core API, data structures, state transitions, limits and CSP (Japanese)

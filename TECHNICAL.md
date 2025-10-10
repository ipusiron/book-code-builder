# TECHNICAL.md - 技術実装詳細

Book Code Builderの技術的な実装の詳細、アルゴリズム、設計パターン、および開発者向けの高度な情報をまとめたドキュメントです。

## 目次

1. [データ構造の設計](#データ構造の設計)
2. [ラウンドロビン割当アルゴリズム](#ラウンドロビン割当アルゴリズム)
3. [インデックス構築アルゴリズム](#インデックス構築アルゴリズム)
4. [Unicode対応トークン化](#unicode対応トークン化)
5. [セキュリティ実装](#セキュリティ実装)
6. [パフォーマンス最適化](#パフォーマンス最適化)
7. [状態管理パターン](#状態管理パターン)
8. [CSP準拠の実装](#csp準拠の実装)

---

## データ構造の設計

### 3次元配列構造 (structure)

**目的**: 座標から単語への高速な直接アクセス

```javascript
// structure[page][line][word]
structure = [
  // Page 1 (index 0)
  [
    ["the", "wolf", "and"],     // Line 1 (index 0)
    ["the", "lamb", "met"],     // Line 2 (index 1)
  ],
  // Page 2 (index 1)
  [
    ["said", "the", "wolf"],    // Line 1 (index 0)
  ]
]
```

**アクセスパターン**:
```javascript
// Decode: p:l:w → word
const word = structure[p-1][l-1][w-1];  // O(1)
```

**特徴**:
- **時間計算量**: O(1) - 定数時間でアクセス可能
- **空間計算量**: O(n) - nは総単語数
- **メモリ効率**: 各単語を1回だけ格納（参照ではなく値）

---

### 逆引きインデックス (index)

**目的**: 単語から全出現座標への高速検索

```javascript
// index: Map<word, [{p, l, w}, ...]>
index = new Map([
  ["the", [
    {p: 1, l: 1, w: 1},
    {p: 1, l: 2, w: 1},
    {p: 2, l: 1, w: 2}
  ]],
  ["wolf", [
    {p: 1, l: 1, w: 2},
    {p: 2, l: 1, w: 3}
  ]]
]);
```

**アクセスパターン**:
```javascript
// Encode: word → coordinates
const coords = index.get(word);  // O(1) average
```

**特徴**:
- **データ構造**: JavaScript Map (ハッシュテーブル)
- **時間計算量**: 平均 O(1)、最悪 O(n)
- **空間計算量**: O(n) - n=総単語数、各単語の出現回数分の座標を保持

**実装のポイント**:
```javascript
// 単語の正規化後に格納
const normalizedWord = normalizeText(word, settings);
if (!index.has(normalizedWord)) {
  index.set(normalizedWord, []);
}
index.get(normalizedWord).push({p, l, w});
```

---

### ラウンドロビンポインタ (rr)

**目的**: 各単語の次に使用する座標位置を記録

```javascript
// rr: Map<word, pointer>
rr = new Map([
  ["the", 2],    // 次は3番目の出現位置を使用
  ["wolf", 1]    // 次は2番目の出現位置を使用
]);
```

**特徴**:
- **初期状態**: 空のMap（使用時に0から開始）
- **更新タイミング**: 暗号化のたびに +1
- **循環**: `pointer % locations.length` で循環
- **リセット**: インデックス再構築時に `rr.clear()`

---

## ラウンドロビン割当アルゴリズム

### 概要

同じ単語の複数出現位置を順番に使用することで、頻度分析攻撃への耐性を向上させるアルゴリズム。

### 実装

**script.js:232-242**:
```javascript
for (const w of words) {
  const locs = state.index.get(w);
  if (!locs || locs.length === 0) {
    codes.push('{???}');
    missing.push(w);
  } else {
    let loc;
    if (state.useRoundRobin) {
      // Round-robin: 循環的に座標を使用
      const ptr = state.rr.get(w) || 0;
      loc = locs[ptr % locs.length];
      state.rr.set(w, ptr + 1);
    } else {
      // Always first: 常に最初の座標
      loc = locs[0];
    }
    codes.push(`${loc.p}:${loc.l}:${loc.w}`);
  }
}
```

### アルゴリズムの詳細

#### ステップ1: ポインタの取得
```javascript
const ptr = state.rr.get(w) || 0;
```
- Mapから現在のポインタ値を取得
- 存在しない場合は0（初回使用）

#### ステップ2: 座標の選択
```javascript
loc = locs[ptr % locs.length];
```
- モジュロ演算 `%` で循環
- 例: 出現3回の単語で ptr=5 の場合、5 % 3 = 2 → 3番目の座標

#### ステップ3: ポインタの更新
```javascript
state.rr.set(w, ptr + 1);
```
- 次回使用時のために +1
- この更新が「毎回異なる暗号文」の原因

### 計算量分析

| 操作 | 時間計算量 | 説明 |
|------|-----------|------|
| ポインタ取得 | O(1) | Map.get() |
| 座標選択 | O(1) | 配列アクセス + モジュロ演算 |
| ポインタ更新 | O(1) | Map.set() |
| **合計** | **O(1)** | 単語あたり定数時間 |

### 具体例

**初期状態**:
```javascript
index.get("the") = [
  {p:1, l:1, w:1},  // 位置0
  {p:3, l:5, w:2},  // 位置1
  {p:7, l:2, w:1}   // 位置2
];
rr.get("the") = undefined;  // 未使用
```

**1回目の暗号化**:
```javascript
ptr = 0;                      // 初回
loc = locs[0 % 3] = locs[0];  // {p:1, l:1, w:1}
rr.set("the", 1);             // 次回は位置1を使用
出力: "1:1:1"
```

**2回目の暗号化**:
```javascript
ptr = 1;                      // 前回の更新値
loc = locs[1 % 3] = locs[1];  // {p:3, l:5, w:2}
rr.set("the", 2);             // 次回は位置2を使用
出力: "3:5:2"
```

**3回目の暗号化**:
```javascript
ptr = 2;
loc = locs[2 % 3] = locs[2];  // {p:7, l:2, w:1}
rr.set("the", 3);
出力: "7:2:1"
```

**4回目の暗号化（循環）**:
```javascript
ptr = 3;
loc = locs[3 % 3] = locs[0];  // 位置0に戻る
rr.set("the", 4);
出力: "1:1:1"  // 1回目と同じ
```

### 設計上の工夫

#### 1. 状態の永続化
```javascript
// ポインタはグローバルstateに保持
state.rr = new Map();
```
- セッション中は値が保持される
- ページリロードでリセット

#### 2. ON/OFF切り替え
```javascript
if (state.useRoundRobin) {
  // ラウンドロビン
} else {
  // 常に最初の座標
  loc = locs[0];
}
```
- ユーザーが挙動を選択可能
- 教育目的での比較実験が可能

#### 3. 循環の自動処理
```javascript
ptr % locs.length
```
- 明示的な条件分岐不要
- モジュロ演算で自動循環

---

## インデックス構築アルゴリズム

### 概要

コードブックテキストを解析し、効率的な暗号化・復号のためのデータ構造を構築。

### アルゴリズムフロー

```
入力: referenceText (文字列)
出力: structure (3D配列), index (Map)

1. テキスト正規化
   ↓
2. 行分割
   ↓
3. ページ分割 (Lines Per Page)
   ↓
4. 各ページ・各行をトークン化
   ↓
5. 座標を記録
   ↓
6. 統計情報を計算
```

### 実装詳細

**script.js:223-269**:

#### ステップ1: 設定読み込みと正規化
```javascript
state.lpp = Math.max(1, +$('#linesPerPage').value || 40);
state.normCase = $('#normalizeCase').checked;
state.normNFKC = $('#normalizeNFKC').checked;

const raw = $('#referenceText').value;
const normalizedAll = normalizeText(raw, {
  lower: state.normCase,
  nfkc: state.normNFKC
});
```

**工夫点**:
- `Math.max(1, ...)`: 最小値1を保証
- 正規化設定の一元管理

#### ステップ2: 行分割とページ分割
```javascript
const lines = normalizedAll.split(/\r?\n/);
state.normalizedLines = lines.slice();

const pages = [];
for (let i = 0; i < lines.length; i += state.lpp) {
  pages.push(lines.slice(i, i + state.lpp));
}
```

**工夫点**:
- `/\r?\n/`: Windows (CRLF) と Unix (LF) 両対応
- `slice()`: 元配列のコピー（非破壊的）
- ループでページ分割: メモリ効率的

#### ステップ3: トークン化とインデックス構築
```javascript
pages.forEach((pageLines, pIdx) => {
  const linesArr = [];
  pageLines.forEach((ln, lIdx) => {
    const words = tokenize(ln);
    totalLines += 1;
    totalWords += words.length;

    words.forEach((w, wIdx) => {
      const key = w;  // すでに正規化済み
      const loc = { p: pIdx + 1, l: lIdx + 1, w: wIdx + 1 };
      if (!state.index.has(key)) state.index.set(key, []);
      state.index.get(key).push(loc);
    });

    linesArr.push(words);
  });
  state.structure.push(linesArr);
});
```

**工夫点**:
- **ネストしたforEach**: 可読性と保守性
- **0-indexed → 1-indexed変換**: `pIdx + 1`, `lIdx + 1`, `wIdx + 1`
- **遅延初期化**: `if (!state.index.has(key))` で必要時のみ配列作成

### 計算量分析

| ステップ | 時間計算量 | 説明 |
|---------|-----------|------|
| 正規化 | O(m) | m=文字数 |
| 行分割 | O(m) | 文字列スキャン |
| ページ分割 | O(k) | k=行数 |
| トークン化 | O(m) | 正規表現マッチング |
| インデックス構築 | O(n) | n=単語数 |
| **合計** | **O(m + n)** | 線形時間 |

**空間計算量**: O(n)
- structure: n個の単語を格納
- index: n個の座標を格納

### UI最適化

#### 非同期処理でUIブロック防止
```javascript
function buildIndex() {
  const btn = $('#buildBtn');
  btn.textContent = '構築中...';
  btn.disabled = true;

  setTimeout(() => {
    // インデックス構築処理
    // ...

    btn.textContent = originalText;
    btn.disabled = false;
  }, 50);
}
```

**工夫点**:
- `setTimeout(..., 50)`: UIスレッドを解放
- ボタンのテキスト変更でフィードバック
- 処理中はボタン無効化

---

## Unicode対応トークン化

### 正規表現パターン

**script.js:75**:
```javascript
const WORD_RE = /[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu;
```

### パターン解説

#### 基本パターン: `[\p{L}\p{N}]+`
- `\p{L}`: Unicodeの任意の文字（Letter）
  - ラテン文字、キリル文字、ギリシャ文字、漢字、ひらがな、カタカナなど
- `\p{N}`: Unicodeの任意の数字（Number）
  - アラビア数字、全角数字など
- `+`: 1文字以上

**マッチ例**:
- `hello`, `world`, `ABC`, `123`
- `日本語`, `Русский`, `العربية`

#### オプショナルパターン: `(?:[-'''][\p{L}\p{N}]+)*`
- `(?:...)`: 非キャプチャグループ
- `[-''']`: ハイフンまたはアポストロフィ（3種類）
  - `-`: ASCII ハイフン
  - `'`: ASCII アポストロフィ
  - `'`: カーリーアポストロフィ（U+2019）
- `*`: 0回以上繰り返し

**マッチ例**:
- `don't`, `it's`, `rock'n'roll`
- `co-operate`, `self-driving`
- `COVID-19`, `Windows-10`

#### フラグ: `gu`
- `g`: Global（すべてマッチを検索）
- `u`: Unicode mode（`\p{}`を有効化）

### 従来の正規表現との比較

#### 従来（ASCII のみ）
```javascript
/[a-zA-Z0-9]+(?:[-'][a-zA-Z0-9]+)*/g
```
- ❌ 多言語非対応
- ❌ 全角文字を認識しない

#### 本実装（Unicode 対応）
```javascript
/[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu
```
- ✅ 多言語対応
- ✅ 全角・半角両対応
- ✅ 国際化されたコードブックに対応

### テストケース

```javascript
const WORD_RE = /[\p{L}\p{N}]+(?:[-'''][\p{L}\p{N}]+)*/gu;

// 基本的な英単語
"hello world".match(WORD_RE);
// → ["hello", "world"]

// ハイフン・アポストロフィ
"don't co-operate".match(WORD_RE);
// → ["don't", "co-operate"]

// 数字混在
"COVID-19 abc123".match(WORD_RE);
// → ["COVID-19", "abc123"]

// 日本語
"日本語のテスト".match(WORD_RE);
// → ["日本語のテスト"]

// 句読点で区切られる
"Hello, world! How are you?".match(WORD_RE);
// → ["Hello", "world", "How", "are", "you"]
```

### パフォーマンス

- **時間計算量**: O(m) - m=文字数
- **空間計算量**: O(k) - k=マッチ数
- **最適化**: ブラウザーネイティブの正規表現エンジン利用

---

## セキュリティ実装

### 1. XSS（クロスサイトスクリプティング）防止

#### escapeHtml() 関数

**script.js:147-152**:
```javascript
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

**仕組み**:
1. 一時的なdiv要素を作成
2. `textContent`にユーザー入力を設定
   - ブラウザーが自動的にエスケープ
3. `innerHTML`で取得（エスケープ済み文字列）

**変換例**:
```javascript
escapeHtml('<script>alert("XSS")</script>');
// → "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
```

**使用箇所**:
- ビューワーの単語表示: `escapeHtml(word)`
- 暗号化エラーメッセージ: `escapeHtml(missing.slice(0, 10).join(', '))`
- 座標情報表示: `escapeHtml(word)`

#### textContent 優先使用

```javascript
// ✅ 安全
element.textContent = userInput;

// ❌ 危険
element.innerHTML = userInput;
```

**使用例**:
```javascript
$('#viewer').textContent = 'インデックス未構築です。';
setNote(element, message, type);  // textContent使用
```

### 2. パストラバーサル攻撃の防止

#### validateFilename() 関数

**script.js:700-714**:
```javascript
function validateFilename(filename) {
  // 英数字、スペース、ハイフン、アンダースコア、.txt拡張子のみ許可
  const safePattern = /^[a-zA-Z0-9\s\-_']+\.txt$/;
  if (!safePattern.test(filename)) {
    console.error('Invalid filename detected:', filename);
    return false;
  }
  // パス区切り文字、親ディレクトリ参照を拒否
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    console.error('Path traversal attempt detected:', filename);
    return false;
  }
  return true;
}
```

**防御する攻撃例**:
```javascript
// ❌ 拒否されるファイル名
validateFilename('../../../etc/passwd');        // false (親ディレクトリ)
validateFilename('../../data/secrets.txt');     // false (..)
validateFilename('data/file.txt');              // false (/)
validateFilename('C:\\Windows\\System32.txt');  // false (\)
validateFilename('file.exe');                   // false (.txt以外)
validateFilename('<script>.txt');               // false (特殊文字)

// ✅ 許可されるファイル名
validateFilename('Aesops Fables.txt');          // true
validateFilename("King James Bible.txt");       // true
validateFilename('file-name_123.txt');          // true
```

**使用箇所**:
```javascript
async function loadCodebook(filename) {
  if (!validateFilename(filename)) {
    alert(`セキュリティ上の理由でファイル名が拒否されました: ${filename}`);
    return null;
  }
  const response = await fetch(`data/${filename}`);
  // ...
}
```

### 3. Content Security Policy (CSP)

#### CSPヘッダー

**index.html:8**:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self';
           script-src 'self';
           style-src 'self';
           img-src 'self' data:;
           font-src 'self';
           connect-src 'self';
           object-src 'none';
           base-uri 'self';
           form-action 'none';" />
```

**ディレクティブ解説**:
| ディレクティブ | 設定値 | 説明 |
|-------------|-------|------|
| `default-src` | `'self'` | すべてのリソースは同一オリジンのみ |
| `script-src` | `'self'` | スクリプトは同一オリジンのみ（インラインJS禁止） |
| `style-src` | `'self'` | スタイルは同一オリジンのみ（インラインCSS禁止） |
| `img-src` | `'self' data:` | 画像は同一オリジン + Data URI |
| `object-src` | `'none'` | Flash等のオブジェクト禁止 |
| `form-action` | `'none'` | フォーム送信禁止 |

#### インラインスタイル排除の実装

**問題**:
```javascript
// ❌ CSP違反
element.style.display = 'none';
element.style.color = '#9ca3af';
```

**解決策**:
```javascript
// ✅ CSP準拠
element.classList.add('hidden');
element.classList.add('line-number');
```

**CSS定義**:
```css
.hidden { display: none; }
.line-number { color: #9ca3af; }
.coord-highlight { background: var(--hl); padding: 2px 4px; border-radius: 3px; }
```

**実装例**:
```javascript
// Before (CSP違反)
$('#viewerSelection').style.display = 'none';
$('#codebookPresets').style.display = 'flex';

// After (CSP準拠)
$('#viewerSelection').classList.add('hidden');
$('#codebookPresets').classList.remove('hidden');
```

---

## パフォーマンス最適化

### 1. データ構造の選択

#### Map vs Object

**選択理由**:
```javascript
// ❌ Object
const index = {};
index[word] = [...];  // キーは文字列のみ

// ✅ Map
const index = new Map();
index.set(word, [...]);  // 任意の型をキーにできる
```

**Map の利点**:
- キーの型制約なし
- 反復処理が高速
- サイズ取得が O(1): `map.size`
- パフォーマンスが安定

### 2. 計算量の最適化

#### 暗号化の時間計算量

**全体**: O(n) - n=平文の単語数

**内訳**:
```javascript
// 1. 正規化: O(m) - m=文字数
const norm = normalizeText(srcRaw, {...});

// 2. トークン化: O(m)
const words = tokenize(norm);

// 3. 各単語の処理: O(n)
for (const w of words) {
  // Map検索: O(1) average
  const locs = state.index.get(w);

  // ラウンドロビン: O(1)
  const ptr = state.rr.get(w) || 0;
  loc = locs[ptr % locs.length];
  state.rr.set(w, ptr + 1);

  // 文字列連結: O(1)
  codes.push(`${loc.p}:${loc.l}:${loc.w}`);
}

// 4. 結合: O(n)
return codes.join(' ');
```

**合計**: O(m + n) - 線形時間

#### 復号の時間計算量

**全体**: O(n) - n=座標の数

```javascript
// 1. パース: O(n)
const triples = parseCodeTokens(cipherRaw);

// 2. 各座標の処理: O(n)
for (const t of triples) {
  // 配列アクセス: O(1)
  const word = state.structure[p-1][l-1][w-1];
  out.push(word);
}

// 3. 結合: O(n)
return out.join(' ');
```

**合計**: O(n) - 線形時間

### 3. メモリ使用量の最適化

#### 統計情報の計算

```javascript
// ループ中にカウント（追加メモリ不要）
let totalWords = 0;
let totalLines = 0;

pageLines.forEach((ln, lIdx) => {
  const words = tokenize(ln);
  totalLines += 1;
  totalWords += words.length;
  // ...
});
```

**メモリ効率**:
- カウンタ変数のみ: O(1)
- 別配列作成なし

### 4. UI応答性の確保

#### setTimeout による非同期化

```javascript
function buildIndex() {
  // UIを更新
  btn.textContent = '構築中...';
  btn.disabled = true;

  // 重い処理を次のイベントループへ
  setTimeout(() => {
    // インデックス構築...

    // UIを復元
    btn.textContent = originalText;
    btn.disabled = false;
  }, 50);
}
```

**効果**:
- UIスレッドがブロックされない
- ボタンのテキスト変更が即座に反映
- ユーザーにフィードバックを提供

---

## 状態管理パターン

### グローバルstate オブジェクト

**script.js:177-192**:
```javascript
const state = {
  // 設定
  lpp: 40,
  normCase: true,
  normNFKC: true,
  useRoundRobin: true,

  // データ構造
  structure: [],
  index: new Map(),
  rr: new Map(),

  // 統計
  totals: { pages: 0, lines: 0, words: 0, unique: 0 },

  // ビューワー用
  normalizedLines: []
};
```

### 設計パターン: Singleton

**特徴**:
- アプリケーション全体で1つのstateオブジェクト
- すべての機能からアクセス可能
- 状態の一元管理

**利点**:
1. **一貫性**: すべての機能が同じデータを参照
2. **保守性**: 状態の変更箇所が明確
3. **デバッグ**: コンソールで `state` を確認可能

**欠点**:
- グローバル変数の使用
- テストが難しい（モック化が必要）

### 状態のライフサイクル

```
ページ読み込み
  ↓
state初期化（デフォルト値）
  ↓
プリセット読み込み
  ↓
インデックス構築
  ↓
state.structure, state.index 更新
  ↓
暗号化・復号
  ↓
state.rr 更新（ラウンドロビン）
  ↓
インデックス再構築（リセット）
```

### 状態更新の例

#### インデックス構築時
```javascript
state.structure = [];
state.index.clear();
state.rr.clear();

// データ構築...

state.totals = {
  pages: pages.length,
  lines: totalLines,
  words: totalWords,
  unique: state.index.size
};
```

#### 暗号化時
```javascript
// ラウンドロビンポインタのみ更新
const ptr = state.rr.get(w) || 0;
state.rr.set(w, ptr + 1);
```

---

## CSP準拠の実装

### インラインスタイル排除の戦略

#### 1. 静的クラスの定義

**style.css**:
```css
/* Utility classes */
.hidden { display: none; }
.line-number { color: #9ca3af; }
.coord-highlight {
  background: var(--hl);
  padding: 2px 4px;
  border-radius: 3px;
}
```

#### 2. 動的なクラス操作

**script.js**:
```javascript
// 表示/非表示の切り替え
element.classList.add('hidden');
element.classList.remove('hidden');

// 複数クラスの管理
element.classList.toggle('active');
```

#### 3. HTMLテンプレートでのクラス使用

```javascript
// ビューワーの行番号
const lineHtml = `
  <div class="line">
    <span class="line-number">[${p}:${ln}]</span>
    ${wordsHtml}
  </div>
`;

// 座標のハイライト
const coordHtml = `
  <strong class="coord-highlight">${coord}</strong>
`;
```

### Data URI の活用

#### Favicon の実装

**index.html:11**:
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>📖</text></svg>" />
```

**利点**:
- 外部ファイル不要
- HTTPリクエスト削減
- CSP `img-src data:` で許可

---

## まとめ

### 技術的ハイライト

1. **効率的なデータ構造**:
   - 3次元配列 + Map による O(1) アクセス
   - メモリと速度のバランス

2. **ラウンドロビンアルゴリズム**:
   - 状態を持つ割当方式
   - 頻度分析攻撃への耐性

3. **Unicode完全対応**:
   - `\p{L}` による多言語サポート
   - 国際化されたコードブック対応

4. **包括的セキュリティ**:
   - XSS防止（escapeHtml, textContent）
   - パストラバーサル防止（validateFilename）
   - CSP準拠（インラインコード排除）

5. **パフォーマンス最適化**:
   - 線形時間アルゴリズム O(n)
   - UI応答性の確保（setTimeout）

### 拡張性

このアーキテクチャは以下の拡張に対応可能:

- **複数コードブックのサポート**: stateを配列化
- **暗号文の圧縮**: 座標の差分エンコーディング
- **統計分析機能**: index情報の活用
- **エクスポート機能**: JSONシリアライゼーション
- **Web Worker化**: バックグラウンドでのインデックス構築

---

## 参考文献

- **Unicode Regular Expressions**: https://www.unicode.org/reports/tr18/
- **Content Security Policy**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- **JavaScript Map**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
- **OWASP XSS Prevention**: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

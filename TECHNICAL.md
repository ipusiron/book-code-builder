# TECHNICAL.md - 技術実装詳細

Book Code Builderの計算、状態管理、入力制限、表示について説明します。
使用例と教育上の限界は [README.md](README.md) / [README.en.md](README.en.md) を参照してください。

## データ構造の設計

### ファイルの責務

| ファイル | 責務 |
|---|---|
| `core.js` | DOMに依存しない正規化、トークン化、索引、座標の符号化・復号、上限検査 |
| `script.js` | 構築済み状態、世代番号、非同期読込、結果、コピー、タブ、ビューワー |
| `learning-samples.js` | 本文と平文、設定を組み合わせた4種類の学習用データ |
| `messages.js` | 日英の動的メッセージとプリセット名 |
| `static-messages.js` | HTMLの静的な日本語に対応する英訳 |
| `i18n.js` | 言語の決定、保存、静的文言の切替と変更通知 |
| `style.css` | 配色、狭幅表示、状態別クラス |

`core.js` はブラウザーでは `BookCodeCore`、Node.jsではCommonJSのexportsを提供します。
ビルド、外部ライブラリー、Web Workerは使いません。

### 3次元配列と逆引き索引

`structure[page][line][word]` は内部では0始まり、表示座標は1始まりです。
次のデータはページあたり2行の例です。

```javascript
const structure = [
  [['the', 'wolf', 'and'], ['the', 'lamb', 'met']],
  [['said', 'the', 'wolf']]
];
// 2:1:3 → structure[1][0][2] → 'wolf'
```

`index` は `Map<word, Array<{p,l,w}>>` で、出現順に全座標を保持します。
たとえば上の `wolf` は `[{p:1,l:1,w:2}, {p:2,l:1,w:3}]` です。
`totals` は `pages`、`lines`、`words`、`unique` を持ち、空行も行数に含めます。
`normalizedLines` は正規化済みの行文字列です。

この構造により座標からの配列アクセスと、単語からの逆引きを分けています。
Mapの内部実装が常にハッシュテーブルであることや、あらゆる入力で定数時間となることは保証しません。

### 公開API

```javascript
const C = require('./core.js');
const book = C.buildIndex('alpha beta\n\ngamma alpha\nbeta delta', {
  lpp: 2, lower: true, nfkc: true
});
const encoded = C.encode(book, 'alpha alpha alpha beta delta', true);
console.log(encoded.text);
// 1:1:1 2:1:2 1:1:1 1:1:2 2:2:2
console.log(C.decode(book, encoded.text).text);
// alpha alpha alpha beta delta
```

| API | 戻り値・動作 |
|---|---|
| `normalizeText(text, {lower,nfkc})` | NFKC→小文字の順で処理した文字列 |
| `tokenize(text)` | 正規表現で得た単語配列。単独では正規化しない |
| `positiveInteger(value,max)` | 1以上max以下の安全な整数。空、非整数、範囲外は拒否 |
| `buildIndex(raw,options)` | structure、index、normalizedLines、設定、totals |
| `encode(book,raw,roundRobin,pointers)` | text、missing、次のpointers、count、normalized、trace、missingCounts、encodedCount |
| `compare(book,raw)` | 空の巡回Mapで計算したon、off、単語ごとの差のrows、differentCount |
| `parseCodeTokens(raw)` | 座標の3要素配列、または不正トークンのnull |
| `decode(book,raw)` | text、bad、count |
| `validateFilename(filename)` | 許可する単独の.txtファイル名ならtrue |
| `LIMITS` | 入出力・表示上限の凍結オブジェクト |

省略した `lower`、`nfkc`、`roundRobin` はtrue、`lpp` は40です。
入力が不正なら、検査関数は `RangeError` を投げます。
`textLimit`、`lineLimit`、`wordLimit`、`tokenLimit`、`outputLimit`、`integer`、`noWords`、`noCodes` などのキーを画面側で翻訳します。

## 学習用の派生データ

`encode`は実際の座標選択と同時に`trace`を作ります。
各要素は`{word, occurrences, coordinate, code}`です。
未収録語では出現数が0、座標がnull、codeが`{???}`になります。
座標オブジェクトは索引から複製し、表示側が索引を書き換えないようにしています。

`normalized`は単語抽出前の正規化後全文です。
`missingCounts`は初出順の`{word, count}`配列、`encodedCount`は変換できた延べ語数です。
集計にはMapを使い、文字列のキーをオブジェクトのプロパティとして解釈しません。
安全性や意味の一致は評価しません。

`compare`はON/OFFをそれぞれ空のMapから計算し、通常の`state.rr`を受け取りません。
各行の`different`はON/OFFの出力文字列が異なるかを示します。
両方が`{???}`なら差として数えません。
どちらかの計算で上限を超えた場合は、比較全体を失敗として扱います。

画面は`encodingResult`と`comparisonResult`を別々に保持します。
言語変更とページ送りでは保存済みの結果を描画し、変換を再実行しません。
各一覧の表示は50件ずつで、合計件数の計算は省略しません。
学習サンプルは選択時にプレビューするだけで、明示的な適用時に入力と設定を置き換えます。
その際に読込世代を更新し、古い非同期レスポンスを無効にします。

## ラウンドロビン割当アルゴリズム

### ポインタの取得・選択・更新

`rr` は `Map<word, number>` で、次に使う出現位置を保持します。
ONの場合の中心処理は次のとおりです。

```javascript
const pointer = (next.get(word) || 0) % locations.length;
const { p, l, w } = locations[pointer];
next.set(word, (pointer + 1) % locations.length);
```

3カ所に出る語は、ポインタ `0 → 1 → 2 → 0` で巡回します。
1カ所なら常に0、OFFならポインタにかかわらず先頭の座標を使います。
乱数、確率的な選択、安全度の計算はありません。

### 成功時だけ反映する

`encode` は渡されたMapを直接変更せず、複製した `next` を更新します。
画面側は出力上限を含めて成功した場合だけ `state.rr = result.pointers` を実行します。
失敗した変換でポインタは進みません。
未収録語は `{???}` となり、その単語のポインタを作りません。

### 状態を保持する期間

ページ内の連続した暗号化ではポインタを保持します。
索引の無効化・再構築、ラウンドロビンの切り替え、再読込でリセットします。
言語切り替え、復号、ビューワー操作では変更しません。
復号は直接座標を引くため、暗号化側のポインタを必要としません。

同じ単語が複数の座標を持つことと、1つの座標が複数の単語を指すことは別です。
この実装の有効な座標は、1つの構築済み索引内では一意です。

## インデックス構築アルゴリズム

1. 生の参照文の型・長さと、ページあたりの行数を検査する。
2. NFKC→小文字化を設定に応じて適用し、正規化後の長さも検査する。
3. `/\r\n?|\n/` で行分割し、行数を検査する。
4. 各行をトークン化し、総単語数の上限を検査する。
5. 行番号からページ・ページ内の行を求め、structureとindexへ座標を登録する。
6. 単語が1つもなければ拒否する。成功時に設定と統計を返す。

0始まりの行番号を `i`、ページ行数を `lpp` とすると、ページは `Math.floor(i/lpp)`、ページ内の行は `i % lpp` です。
空行、末尾改行でできる空行も位置を占めます。
画面のtextareaは改行をLFへ正規化しますが、コアはLF、CRLF、CRを受け付けます。

構築済みの本文と設定をスナップショットとして扱います。
編集直後に古い索引を無効化し、構築中も暗号化・復号を無効にします。
変換関数の入口でも現在の入力とスナップショットを比較します。

## Unicode対応トークン化

### 正規表現

```javascript
/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu
```

- `\p{L}`：UnicodeのLetter
- `\p{N}`：UnicodeのNumber
- `[-']`：ASCIIハイフンとASCIIアポストロフィのみ
- `g`：一致箇所全体を抽出
- `u`：Unicodeモード

### 検証する例

| 入力（正規化せずtokenize） | トークン |
|---|---|
| `hello world` | `hello`, `world` |
| `don't co-operate` | `don't`, `co-operate` |
| `COVID-19 abc123` | `COVID-19`, `abc123` |
| `don’t` | `don`, `t` |
| `日本語のテスト` | `日本語のテスト` |
| `flag{book_code}` | `flag`, `book`, `code` |

Unicode対応というだけで、あらゆる言語の単語を正しく分割するわけではありません。
結合文字を直接含めていないため、NFKCの有無や合成可能性で結果が変わります。
小文字化はJavaScriptの `toLowerCase()` であり、完全なUnicode case foldingではありません。
NFKCは[Unicode UAX #15](https://www.unicode.org/reports/tr15/)の互換正規化です。

単語の数え方を変えると座標の互換性が変わります。
3冊の本文データを変更する場合も、本文・改行・注記を含む全体を対象にテストしてください。

## セキュリティ実装

### ユーザー入力の表示

文字列の表示には `textContent`、`document.createTextNode`、`textarea.value` を使います。
単語ボタンや座標ラベルも `createElement` で組み立てます。
参照文、未収録語、タイトルなどを `innerHTML` に渡しません。

静的英訳の適用もテキストノードの `nodeValue` または属性値を更新するだけです。
辞書は同梱のUI文言であり、ユーザーのコードブックや結果を翻訳しません。

### 読込先とマニフェストの検査

- `filename`：最大200文字、ASCII英数字・空白・アンダースコア・ハイフン・アポストロフィと末尾の `.txt`
- `id`：空でない小文字英数字・ハイフン、一意
- `title`：文字列、最大200コード単位
- `codebooks`：配列、最大50件
- マニフェスト本文：最大100,000コード単位

スラッシュ、バックスラッシュ、タブ、改行、途中のドットをファイル名に含められません。
ファイル名は `encodeURIComponent` を通して固定の `data/` の後ろへ付けます。
fetchは `credentials: 'omit'`、`redirect: 'error'` です。
サイズを逐次検査し、10秒でAbortControllerを中断します。HTTP 401を受けたページでは以後の読込を停止します。

### 入力と出力の上限

正本は `BookCodeCore.LIMITS` です。

| キー | 値 |
|---|---:|
| reference | 1,000,000 |
| words | 100,000 |
| lines | 50,000 |
| plain | 20,000 |
| cipher | 100,000 |
| decoded | 1,000,000 |
| tokens | 10,000 |
| lpp | 200 |
| viewWords | 2,000 |
| viewLines | 100 |
| occurrences | 100 |

文字列長はUTF-16コード単位です。復号では結果を結合する前に累積長を検査します。
これにより、長い1語を指す短い座標を繰り返すだけで巨大な出力が作られることを防ぎます。
暗号化の出力もcipher上限を検査するため、そのまま同期できる長さに収まります。

### 保存とコピー

localStorageへ保存するキーは `book-code-builder.language` だけです。
アクセス失敗は捕捉し、ページ内の言語切り替えを継続します。
入力・索引・結果・巡回位置は永続保存しません。

コピーは操作時点の結果を渡し、8秒で失敗扱いにします。成功・失敗・非対応の通知後、2秒で通常のボタンに戻します。
各ボタンのタスク識別により、入力が変わった後の遅いPromiseが、古い結果用のボタンを再有効化しません。
タイムアウト後に到着した完了も無視します。
OSのクリップボードやブラウザーの記録を消去するものではありません。

## パフォーマンスと表示上限

### 計算量の目安

`m` を文字列長、`n` をトークン数、`r` を保持する巡回ポインタ数とします。
Map検索を平均定数時間と見積もった場合の目安です。

| 処理 | 時間・領域の主な要因 |
|---|---|
| 索引構築 | 正規化・走査・トークン化・座標登録で概ねO(m+n)、本文・行・語・座標を保持 |
| 暗号化 | 正規化・トークン化・検索と、巡回Mapの複製で概ねO(m+n+r) |
| 復号 | 座標の解析と直接参照に加え、出力文字列の長さに比例する結合 |
| ビューワー | 100行・2,000語までのDOM、選択語の座標は100件まで |

Mapの採用は、単語キーの逆引きとサイズ・反復処理を使うためです。
Objectより常に高速、ブラウザー間で一定の速度、といった保証ではありません。

### メインスレッドでの処理

構築前の `setTimeout(..., 50)` は「構築中」の描画機会を作ります。
コールバック内の計算は同期処理であり、計算中もUIスレッドが空くわけではありません。
入力上限とDOM表示上限で負荷を制限しますが、端末性能による停止時間は残ります。

### ビューワー

指定ページの指定行から、最大100行または2,000語に達するまで表示します。
省略がある場合は通知し、参照文で確認できることを伝えます。
長い語は先頭120コード単位と省略記号を表示し、選択時の検索は省略前の語で行います。
全出現数はindexから求め、座標の一覧だけを先頭100件に制限します。

変換過程の座標から移動するときは、対象語を含む2,000語単位の区間から表示します。
同じ行の2,000語目より後ろでも、選択した語を表示できます。
省略の通知を出し、言語変更時も開始位置と選択座標を保持します。

## 状態管理パターン

### 編集と結果の対応

| 操作 | 無効化・保持 |
|---|---|
| 参照文・ページ行数・正規化変更 | 索引、暗号化結果、復号結果、巡回位置を無効化 |
| 索引構築 | 新しいスナップショットを計算し、成功後に変換を有効化 |
| 平文変更・平文サンプル | 暗号化結果、変換過程、比較結果を消去 |
| 暗号文変更・同期 | 復号結果だけを消去 |
| ラウンドロビン切替 | 巡回位置、暗号化結果、変換過程、比較結果をリセット |
| 学習サンプルの選択・キャンセル | 入力、結果、巡回位置を保持 |
| 学習サンプルの適用 | 本文・平文・設定を置換、復号入力と全結果を消去、索引を再構築 |
| ON/OFF比較 | 独立して先頭位置から計算。通常の結果と巡回位置は保持 |
| 言語変更 | 再計算せず、構造化した通知と表示だけ更新 |
| 再読込 | 入力・結果・索引・巡回位置を再初期化 |

### 構築と読込の世代管理

`revision` で構築要求を識別します。50ms待機中に入力が変わった場合、古い要求は結果を反映しません。
`loadRevision` とAbortControllerでファイル読込を識別します。
待機中の編集、新しいプリセット選択、明示的な構築は古い読込を無効化します。
取得した本文はコアで検査してから入力欄へ反映するため、取得失敗や空の本文で入力を失いません。

起動時は内蔵サンプルを構築して操作を接続します。
HTTPでは一覧を取得し、入力世代が変わっていない場合だけ先頭プリセットへ進みます。
file URLでは一覧も本文もfetchせず、内蔵サンプルと手入力を使います。

### 日英切り替え

URL指定、保存値、ブラウザー言語の順に言語を決定します。
`i18n.js` は初期HTMLの翻訳対象を記録し、まだ接続され内容が管理下にあるノードだけを更新します。
`languagechange` を受けた `refreshLanguage` は通知キーと値、統計、コピー状態、プリセット名、ビューワーを再表示します。
入力、出力、スナップショット、巡回位置は変更せず、単語の選択も復元します。

## CSPとアクセシビリティ

CSPはHTML metaで、次の指定を使います。

```text
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'none';
```

スクリプトとスタイルは外部ファイルです。ユーザー入力を評価するevalやインラインイベント属性はありません。
表示状態はclassとhiddenで変更します。faviconは固定のdata URLです。
`frame-ancestors` や `X-Content-Type-Options` をmetaで有効にできるという説明はしません。
[HTMLのpragma directives](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv)を参照してください。

タブにはtablist、tab、tabpanel、aria-selected、aria-controls、aria-labelledbyを設定します。
フォーカス対象のタブは1つで、左右矢印・Home・Endで移動します。
単語はネイティブbutton、結果通知はstatus領域です。
配色の文字コントラストは18組で4.5:1以上を回帰テストしますが、これだけでアクセシビリティ全体への適合を保証しません。

## テストと拡張時の注意

`npm test` はNode.js組み込みのテストランナーを使い、インストール不要です。
既知座標、空行、往復、正規化、3冊との互換、入力・出力の境界、状態の無効化、コピー、翻訳、READMEの数値・例・リンクを検査します。

ブラウザーでは自然な入力・クリック・キー操作に加え、読込の遅延、保存拒否、コピー拒否、HTML風の入力を検証します。
Safari、実機、スクリーンリーダーは未検証です。

将来のWorker化、出力ファイル、統計表示、複数のコードブックは別の設計が必要です。
特に数え方を変更する機能は、既存の座標との互換性を明示してから追加してください。

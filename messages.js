/* UI status messages are keys plus values, so language changes never recalculate. */
(function (root) {
  'use strict';
  const ja = {
    build: 'インデックス構築', building: '構築中...', dirty: '参照文または設定が変わりました。インデックスを構築してください。',
    ready: '構築済み。変換できます。', needBuild: 'インデックスを構築してから変換してください。',
    empty: '入力が空です。', encoded: 'すべて符号化できました（{n}語）。',
    missing: '未収録語（{n}語）：{words}', decoded: '復号しました。正規化後の単語列です。',
    badCodes: '不正または範囲外の座標が{n}件あります。[?]で示します。',
    stats: 'ページ数：{pages} ／ 行数：{lines} ／ 単語数：{words} ／ 異なり語数：{unique}',
    changed: '入力が変わりました。変換を実行してください。', loading: 'コードブックを読み込み中です。',
    loaded: 'コードブックを読み込みました。', loadFailed: '読み込めませんでした。入力は保持しています。再構築して続けられます。',
    catalogFailed: 'プリセット一覧を取得できませんでした。内蔵サンプルと手入力を利用できます。',
    fileMode: 'ファイルを直接開いています。プリセット3冊はHTTP配信時に利用できます。内蔵サンプルと手入力は利用できます。',
    error_textType: '文字列を入力してください。', error_textLimit: '文字数の上限を超えています。入力を短くしてください。',
    error_integer: 'ページあたりの行数は1〜200の整数で入力してください。',
    error_lineLimit: '参照文は50,000行以内にしてください。', error_wordLimit: '参照文は100,000語以内にしてください。',
    error_tokenLimit: '1回の変換は10,000語または10,000座標以内にしてください。',
    error_noWords: '変換対象の単語がありません。文字または数字を入力してください。',
    error_noCodes: '復号する座標を入力してください。', error_unknown: '処理できませんでした。入力と設定を確認してください。',
    authStop: 'HTTP 401を受信したため読込を停止しました。このページでは再試行しません。',
    copy: '📋 コピー', copying: 'コピー中...', copied: '✓ コピー完了', copyFailed: 'コピーできません。結果を選択してコピーしてください。',
    copyUnsupported: '自動コピーは利用できません。結果を選択してコピーしてください。',
    viewerInvalid: '有効なページ番号と行番号を入力してください。',
    viewerEmpty: 'インデックス未構築です。まずはインデックスを構築してください。',
    viewerLimit: '表示は指定行から最大100行、2,000語です。続きは行番号を指定してください。',
    selection: '選択：{coord} → {word} ／ 出現数：{n}',
    occurrenceLimit: '座標は先頭100件を表示しています。',
    errorNote: '変換できませんでした。',
  };
  const api = { ja };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BookCodeMessages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

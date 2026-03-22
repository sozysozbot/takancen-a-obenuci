# takan=cen a obenuci — コーパス・辞書

タカン語コーパスの静的Webフロントエンドです。
English version: [README.md](README.md)

## コーパス・辞書の編集者向け

データファイルは以下の2つです：
- `data/corpus.json` — コーパス（例文集）
- `data/dictionary.json` — 辞書

編集後のデータは自動的に検証されます：
- **GitHub上** — プッシュやプルリクエストのたびにCIチェックが走ります。データが不正な場合、チェックが失敗して内容が表示されます。
- **ローカル（推奨）** — コミット前にフックを設定しておくと、プッシュ前に不正なデータを検出できます：

```sh
# クローン後に一度だけ実行
npm install
printf '#!/bin/sh\nnpm test\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

以降、`git commit` のたびに自動でバリデーターが走ります。データが不正な場合はコミットが中止され、エラー内容が表示されます。

バリデーターを手動で実行するには：

```sh
npm test
```

## 未登録語を辞書に追加する

コーパスの例文が辞書に存在しない見出し語IDを参照している場合、サイト上では赤いバッジとして表示されます。そのような未登録エントリをまとめて下書きするには

```sh
python3 extract-staging.py
```

を実行してください。

このスクリプトは `data/corpus.json` をスキャンし、`data/dictionary.json` に存在しない見出し語IDをすべて抽出して、`dictionary-staging.json` に書き出します。出力は `dictionary.json` と同じトップレベル構造を持ちます：

```json
{ "entries": [...], "alternative_form_groups": [...] }
```

各下書きエントリには以下の情報が自動的に入力されます：

- **`id`** — コーパス中に現れる見出し語ID
- **`pos`** / **`conjugation_class`** — IDの形から推定（末尾が `-` → 動詞または助動詞、母音幹・子音幹の別も推定；末尾が `-` でない → 名詞）
- **`script`** — コーパス内でこのIDに対して使われた `mixed_script` の値をすべて列挙（手動で正しい字形に絞り込む）
- **`definitions`** — コーパス中に現れた固有の語義ラベルを列挙（コーパス上のピリオドをスペースに戻したもの。例：`not.exist` → `not exist`）

`alternative_form_groups` には、コーパスの `multiple-standard-pronunciations` トークンのうち少なくとも1つの見出し語IDが辞書に未登録のものが出力されます。

スクリプト実行後、`dictionary-staging.json` を開いて下書きを確認・編集し（品詞 `pos` を修正したり、`script` を適宜削ったり〔動詞は終止形にする〕、`translations` を追加するなど）、完成したエントリを `data/dictionary.json` の `entries` 配列に、完成したグループを `alternative_form_groups` 配列に貼り付けてください。コミット前に `npm test` でバリデーションを行ってください。

## ローカルでサイトを確認する

```sh
python3 -m http.server
```

ブラウザで `http://localhost:8000?lang=ja` を開いてください。

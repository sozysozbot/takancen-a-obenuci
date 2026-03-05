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

## ローカルでサイトを確認する

```sh
python3 -m http.server
```

ブラウザで `http://localhost:8000?lang=ja` を開いてください。

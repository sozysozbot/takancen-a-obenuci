# takan=cen a obenuci — corpus & dictionary

A static web frontend for the Takan-cen constructed language corpus.
Japanese version: [README-ja.md](README-ja.md)

## For corpus/dictionary editors

The data files are:
- `data/corpus.json` — corpus sentences
- `data/dictionary.json` — dictionary entries

After editing, the data is validated automatically:
- **On GitHub** — a CI check runs on every push and pull request. If your data is invalid, the check will fail and show you what went wrong.
- **Locally (recommended)** — set up a pre-commit hook so invalid data is caught before you push:

```sh
# Run once after cloning
npm install
printf '#!/bin/sh\nnpm test\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

After that, `git commit` will automatically run the validator. If the data is invalid the commit is aborted and the errors are shown.

To run the validator manually at any time:

```sh
npm test
```

## Viewing the site locally

```sh
python3 -m http.server
```

Then open `http://localhost:8000` in your browser.

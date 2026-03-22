# takan=cen a obenuci — corpus & dictionary

A static web frontend for the Takan-cen constructed language corpus.
Japanese version: [README-ja.md](README-ja.md)

## For corpus/dictionary editors

The data files are:
- `docs/data/corpus.json` — corpus sentences
- `docs/data/dictionary.json` — dictionary entries

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

## Adding undocumented words to the dictionary

When corpus sentences reference entry IDs that have no dictionary entry yet, the
site displays them as red badges. To draft those missing entries in bulk:

```sh
python3 extract-staging.py
```

This scans `docs/data/corpus.json` for every entry ID absent from `docs/data/dictionary.json`
and writes draft entries to `dictionary-staging.json`. The output has the same
top-level shape as `dictionary.json`:

```json
{ "entries": [...], "alternative_form_groups": [...] }
```

Each draft entry is pre-filled with:

- **`id`** — the entry ID as it appears in the corpus
- **`pos`** and **`conjugation_class`** — inferred from the ID shape (trailing `-`
  → verb or auxiliary verb, vowel/consonant stem; no `-` → noun)
- **`script`** — all `mixed_script` values seen for this ID in the corpus,
  collected so you can manually prune down to the correct logogram(s)
- **`definitions`** — one entry per unique gloss seen in the corpus
  (corpus periods converted back to spaces, e.g. `not.exist` → `not exist`)

`alternative_form_groups` is populated from `multiple-standard-pronunciations`
tokens in the corpus where at least one entry ID is missing from the dictionary.

After running the script, open `dictionary-staging.json`, review and edit the
drafts (fix `pos` [parts of speech], prune `script` [write the (u) form when it is a verb], add
`translations`, etc.), then paste the finished entries into the `entries` array
and the finished groups into the `alternative_form_groups` array
in `data/dictionary.json`. Run `npm test` to validate before committing.

## Viewing the site locally

```sh
python3 -m http.server --directory docs
```

Then open `http://localhost:8000` in your browser.

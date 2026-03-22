# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

A static web frontend for a searchable corpus of a fictitious language named **Takan-cen**, hosted on GitHub Pages. The language has Japanese-like grammar (simple noun declensions, mildly-complex verb conjugations) and a mixed writing system with logograms and syllabaries.

The dictionary and the corpus are given in two separate JSON files. The frontend displays the sentences in the corpus based on the content of the dictionary.

## Architecture

- **Target**: GitHub Pages (static hosting — no server-side code), served from the `docs/` folder
- **Approach**: Pure frontend (HTML/CSS/JS), with TypeScript source files compiled to JS
- No backend; any search/filtering logic runs entirely in the browser
- `docs/main.ts` → `docs/main.js` (main app logic)
- `docs/conjugateAndJoinPure.ts` → `docs/conjugateAndJoinPure.js` (pure conjugation logic, self-contained)
- `docs/toSpacedHiraganaPure.ts` → `docs/toSpacedHiraganaPure.js` (romanization → spaced hiragana, self-contained; also exports `latinToSyllabary`)
- `validate-data.ts` → `validate-data.js` (Zod schemas for JSON validation, run in `npm test`; lives at root, not in `docs/`)
- `docs/types.ts` → `docs/types.js` (shared TypeScript interfaces)

## Local development

`fetch()` requires HTTP — open `index.html` via a local server, not directly:

```
python3 -m http.server --directory docs
```

Then visit `http://localhost:8000`.

The pre-commit hook runs `npm test` (typecheck + data validation) and also auto-formats `docs/data/*.json` with Python.

## Data schemas

**`docs/data/dictionary.json`** — `{ "entries": [ Entry ] }`

Each `Entry`:
```
id                string    unique key; append #N for homophones (e.g. "a#2") — the UI strips
                            #N for display and shows a superscript number (a²) in the header
script            string[]  native script representations (may be empty array or omitted);
                            multiple entries for words with alternate writings (e.g. ["此", "茲"])
pos               string    "noun" | "noun suffix" | "verb" | "auxiliary verb"
                            | "noun particle" | "verb particle" | "sentence particle"
conjugation_class string    "vowel-stem" | "consonant-stem" | "c-irregular" (omit for indeclinables)
                            c-irregular: like consonant-stem for (i)/(u), but (a)→ola and (e)→o
definitions       [ Definition ]
notes             { en?: string, ja: string }   optional
components        string[]  optional; ids of component dictionary entries (for compounds)
```

Each `Definition`:
```
gloss             string    linguistic gloss label in English conventions (e.g. "NOM", "speak", "3sg")
translations      { en?: string, ja: string }   optional;
                            if en is absent, nothing is shown in English UI (the gloss is self-explanatory);
                            ja is always shown in Japanese UI when present
```

**`docs/data/corpus.json`** — `{ "sentences": [ Sentence ] }`

Each `Sentence` (no `id` field — the renderer assigns ids by array index at load time):
```
source      string   provenance label, e.g. "Folk song, verse 1" (optional)
tokens      [ Token ]
translation { en?: string, ja: string }   free translation
```

Each `Token` is one of two shapes:

**Single-form token** (the common case):
```
form         string    surface form in romanization
mixed_script string    mixed logogram+syllabary representation (displayed with LinzklarRounded font);
                       if absent, the UI falls back to pure hiragana computed from `form`
entry_ids    string[]  dictionary entry ids this token links to (one per morpheme for compounds);
                       red badge if id is missing from dictionary, blue+clickable if found
gloss        string    interlinear gloss label, e.g. "sun", "NOM", "speak-PST"
```

**Multi-pronunciation token** (for logograms with multiple equally-valid readings, e.g. "四"):
```
multiple-standard-pronunciations  true      discriminant field
forms                            string[]  all equally-valid romanized readings
mixed_script                     string    logogram (optional, displayed with LinzklarRounded font)
gloss                            string    interlinear gloss label
entry_ids_of_each_form           string[][]  entry ids per form (parallel array with `forms`)
```
Example: `{"multiple-standard-pronunciations": true, "forms": ["méxko", "méxkor"], "gloss": "strength", "entry_ids_of_each_form": [["méxko"], ["méxkor"]]}`

## Romanization conventions

- `c` = サ行 (sa-row), `s` = ザ行, `j` = ヤ行, `l` = ラ行
- Acute accent (á, é, í, ó, ú) marks word stress; unaccented words are phonologically bound to the preceding stressed word (no space in hiragana output)
- `or` → `ou` (long o), `r` alone → `ー`
- 拗音: `CjV` (e.g. `kja`) → Ci-kana + small vowel kana (e.g. `きぁ`), distinct from Japanese `kya` = `きゃ`
- `x` → `っ` (geminate consonant marker, e.g. `káxcen` → `かっせん`)

## About the User

- Native Japanese speaker, fluent English, working knowledge of Spanish/Chinese/French/Korean
- Strong background in TypeScript, Rust, Haskell, ECMAScript spec details, and compiler implementation
- Limited experience with frontend libraries/frameworks (React, etc.) — prefers explicit, understandable code
- Prefers SVG for diagrams; constructs them with Inkscape or hand-written XML

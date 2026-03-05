# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

A static web frontend for a searchable corpus of a fictitious language named **Takan-cen**, hosted on GitHub Pages. The language has Japanese-like grammar (simple noun declensions, complex verb conjugations) and a mixed writing system with logograms and syllabaries.

The dictionary and the corpus will be given in two separate JSON files. The frontend should display the sentences in the corpus based on the content of the dictionary.

## Architecture

- **Target**: GitHub Pages (static hosting — no server-side code)
- **Approach**: Pure frontend (HTML/CSS/JS)
- No backend; any search/filtering logic runs entirely in the browser

## Local development

`fetch()` requires HTTP — open `index.html` via a local server, not directly:

```
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Data schemas

**`data/dictionary.json`** — `{ "entries": [ Entry ] }`

Each `Entry`:
```
id              string   unique key; append #N for homophones (e.g. "ná#2") — the UI strips
                         #N for display and shows a superscript number (ná²) in the header
script          string   native script representation (may be empty)
pos             string   "noun" | "verb" | "noun particle" | "verb particle" | "sentence particle"
conjugation_class string  "vowel-stem" | "consonant-stem" | "c-irregular" (omit for indeclinables)
                         c-irregular: like consonant-stem for (i)/(u), but (a)→ola and (e)→o
definitions     [ { gloss: string, definition: string } ]
notes           string   optional
```

**`data/corpus.json`** — `{ "sentences": [ Sentence ] }`

Each `Sentence`:
```
id          string
source      string   provenance label, e.g. "Folk song, verse 1" (optional)
tokens      [ Token ]
translation string   free translation
```

Each `Token`:
```
form         string    surface form in romanization
mixed_script string    mixed logogram+syllabary representation (displayed with LinzklarRounded font);
                       if absent, the UI falls back to pure hiragana computed from `form`
entry_ids    string[]  dictionary entry ids this token links to (one per morpheme for compounds);
                       red badge if id is missing from dictionary, blue+clickable if found
gloss        string    interlinear gloss label, e.g. "sun", "NOM", "speak-PST"
```

## About the User

- Native Japanese speaker, fluent English, working knowledge of Spanish/Chinese/French/Korean
- Strong background in TypeScript, Rust, ECMAScript spec details, and compiler implementation
- Limited experience with frontend libraries/frameworks (React, etc.) — prefers explicit, understandable code
- Prefers SVG for diagrams; constructs them with Inkscape or hand-written XML
- New to coding agents — prefers being shown what's happening rather than having things done silently

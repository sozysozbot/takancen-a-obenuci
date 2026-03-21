#!/usr/bin/env python3
"""
Scans corpus.json for entry_ids that are absent from dictionary.json and
writes draft dictionary entries to dictionary-staging.json.

Each draft entry is pre-filled with:
  - id, pos, conjugation_class (inferred from id shape)
  - definitions: one per unique gloss seen in the corpus (periods → spaces)

The user can lightly edit (add translations, script, notes, etc.) and paste
the results into dictionary.json.
"""

import json
import unicodedata

# ── Load data ─────────────────────────────────────────────────────────────────

with open("data/corpus.json", encoding="utf-8") as f:
    corpus = json.load(f)
with open("data/dictionary.json", encoding="utf-8") as f:
    dictionary = json.load(f)

entry_map = {e["id"]: e for e in dictionary["entries"]}

# ── Infer pos / conjugation_class from id (mirrors openEntryModal logic) ──────

C_IRREGULAR_IDS = {"ć-", "ác-", "(á)c-"}

def strip_accent(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )

def infer_pos_and_class(entry_id: str) -> dict:
    base = entry_id.split("#")[0]  # strip homophone disambiguator
    if not base.endswith("-"):
        return {"pos": "noun"}
    pos = "auxiliary verb" if base.startswith("(") else "verb"
    # c-irregular check
    if entry_id in C_IRREGULAR_IDS or entry_id.endswith(" ć-"):
        return {"pos": pos, "conjugation_class": "c-irregular"}
    # vowel-stem vs consonant-stem: look at last char of stem (sans parens, accent)
    stem = base.replace("(", "").replace(")", "")[:-1]  # drop trailing '-'
    last = strip_accent(stem)[-1] if stem else ""
    conj = "vowel-stem" if last in set("aeiour") else "consonant-stem"
    return {"pos": pos, "conjugation_class": conj}

# ── Collect missing entry_ids, their corpus glosses, and mixed_script values ──

# ordered dicts preserving first-seen order
missing: dict[str, list[str]] = {}
scripts: dict[str, list[str]] = {}

for sentence in corpus["sentences"]:
    for token in sentence["tokens"]:
        if "punctuation" in token or "multiple-standard-pronunciations" in token:
            continue
        ids = token.get("entry_ids") or []
        gloss = token.get("gloss", "")
        parts = gloss.split("-") if gloss else []
        mixed = token.get("mixed_script", "")
        for i, entry_id in enumerate(ids):
            if entry_id in entry_map:
                continue
            normalized = parts[i].replace(".", " ") if i < len(parts) else ""
            if entry_id not in missing:
                missing[entry_id] = []
                scripts[entry_id] = []
            if normalized and normalized not in missing[entry_id]:
                missing[entry_id].append(normalized)
            if mixed and mixed not in scripts[entry_id]:
                scripts[entry_id].append(mixed)

# ── Build draft entries ───────────────────────────────────────────────────────

staging = []
for entry_id, glosses in missing.items():
    entry: dict = {"id": entry_id}
    entry.update(infer_pos_and_class(entry_id))
    if scripts[entry_id]:
        entry["script"] = scripts[entry_id]
    entry["definitions"] = [{"gloss": g} for g in glosses] if glosses else []
    staging.append(entry)

staging.sort(key=lambda e: e["id"])

with open("dictionary-staging.json", "w", encoding="utf-8") as f:
    json.dump(staging, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Wrote {len(staging)} staged entry/entries to dictionary-staging.json")

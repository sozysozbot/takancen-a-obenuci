#!/usr/bin/env python3
"""
Scans corpus.json for entry_ids that are absent from dictionary.json and
writes draft dictionary entries to dictionary-staging.json.

Output format: {"entries": [...], "alternative_form_groups": [...]}
which mirrors the top-level structure of dictionary.json and can be pasted
directly into dictionary.json after review.

Each draft entry is pre-filled with:
  - id, pos, conjugation_class (inferred from id shape)
  - script: all mixed_script values seen for this id in the corpus
  - definitions: one per unique gloss seen in the corpus (periods → spaces)

alternative_form_groups covers groups from corpus
multiple-standard-pronunciations tokens where at least one entry_id is missing
from the dictionary (and the group is not already present in dictionary.json).
Groups are only generated when every form in the token maps to exactly one
entry_id; tokens with shared suffix morphemes are skipped to avoid confusion.
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
    if entry_id in C_IRREGULAR_IDS or entry_id.endswith(" ć-"):
        return {"pos": pos, "conjugation_class": "c-irregular"}
    stem = base.replace("(", "").replace(")", "")[:-1]  # drop trailing '-'
    last = strip_accent(stem)[-1] if stem else ""
    conj = "vowel-stem" if last in set("aeiour") else "consonant-stem"
    return {"pos": pos, "conjugation_class": conj}

# ── Collect missing entry_ids ─────────────────────────────────────────────────

# ordered dicts preserving first-seen order
missing: dict[str, list[str]] = {}   # entry_id → list of unique glosses
scripts: dict[str, list[str]] = {}   # entry_id → list of unique mixed_script values

def record_missing(entry_id: str, gloss: str, mixed: str) -> None:
    normalized = gloss.replace(".", " ") if gloss else ""
    if entry_id not in missing:
        missing[entry_id] = []
        scripts[entry_id] = []
    if normalized and normalized not in missing[entry_id]:
        missing[entry_id].append(normalized)
    if mixed and mixed not in scripts[entry_id]:
        scripts[entry_id].append(mixed)

# existing alternative_form_groups in the dictionary (to avoid duplicates)
existing_group_sets = {
    frozenset(g["entry_ids"])
    for g in dictionary.get("alternative_form_groups", [])
}

new_groups: list[dict] = []
seen_group_sets: set[frozenset] = set()

for sentence in corpus["sentences"]:
    for token in sentence["tokens"]:
        if "punctuation" in token:
            continue

        if "multiple-standard-pronunciations" in token:
            forms_ids: list[list[str]] = token["entry_ids_of_each_form"]
            mixed: str = token.get("mixed_script", "")
            gloss: str = token.get("gloss", "")
            any_missing = any(
                eid not in entry_map
                for ids in forms_ids for eid in ids
            )
            if not any_missing:
                continue
            for ids in forms_ids:
                for eid in ids:
                    if eid not in entry_map:
                        record_missing(eid, gloss, mixed)
            # Only generate a group when each form maps to exactly one entry_id.
            # Tokens with shared suffix morphemes (e.g. ['mitun≡','≡co']) would
            # otherwise conflate suffix entries with alternative-form entries.
            if all(len(ids) == 1 for ids in forms_ids):
                all_ids = [ids[0] for ids in forms_ids]
                group_set = frozenset(all_ids)
                if group_set not in existing_group_sets and group_set not in seen_group_sets:
                    seen_group_sets.add(group_set)
                    group: dict = {}
                    if mixed:
                        group["script"] = mixed
                    group["entry_ids"] = all_ids
                    new_groups.append(group)
            continue

        # single-form token
        ids = token.get("entry_ids") or []
        gloss = token.get("gloss", "")
        parts = gloss.split("-") if gloss else []
        mixed = token.get("mixed_script", "")
        for i, entry_id in enumerate(ids):
            if entry_id in entry_map:
                continue
            record_missing(entry_id, parts[i] if i < len(parts) else "", mixed)

# ── Build draft entries ───────────────────────────────────────────────────────

staging_entries = []
for entry_id, glosses in missing.items():
    entry: dict = {"id": entry_id}
    entry.update(infer_pos_and_class(entry_id))
    if scripts[entry_id]:
        entry["script"] = scripts[entry_id]
    entry["definitions"] = [{"gloss": g} for g in glosses] if glosses else []
    staging_entries.append(entry)

staging_entries.sort(key=lambda e: e["id"])

output = {
    "entries": staging_entries,
    "alternative_form_groups": new_groups,
}

with open("dictionary-staging.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(
    f"Wrote {len(staging_entries)} entr{'y' if len(staging_entries) == 1 else 'ies'}"
    f" and {len(new_groups)} alternative_form_group(s)"
    f" to dictionary-staging.json"
)

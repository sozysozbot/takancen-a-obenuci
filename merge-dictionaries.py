#!/usr/bin/env python3
"""
Merge the new, somewhat authoritative dictionary
  with the old, enrichment source
→ docs/data/dictionary-merged.json

Rules
-----
1. Entries only in OLD with gloss "(TODO)" or "(未訳)":
     blindly copy into output.
2. Entries only in OLD with any other gloss:
     they exist in the corpus but are missing from the new dictionary —
     copy into output with a warning so the editor can review.
3. Entries only in NEW:
     kept as-is.
4. Entries in BOTH (graceful merge, new is authoritative):
     a. definitions: for each new definition, find a matching old definition
        by gloss and pull in its translations.ja if new is missing it.
        Old definitions with non-TODO/非(未訳) glosses not present in new
        are reported as warnings (not auto-added — new dict is authoritative).
     b. cognates:   use old (new lacks cognates entirely).
     c. notes.ja:   prefer new; fall back to old (no silent drop of either).
     d. script:     prefer new; fall back to old.
     e. components: prefer new; fall back to old.
"""
import json
import sys

BLANK_GLOSSES = {'(TODO)', '(未訳)'}

NEW_PATH = 'docs/data/dictionary-old.json'
OLD_PATH = 'docs/data/dictionary皇言集書2021-12-11.json'
OUT_PATH = 'docs/data/dictionary.json'


def merge_entry(new_e: dict, old_e: dict) -> dict:
    """Merge old into new (new is authoritative). Returns the merged entry."""
    merged = dict(new_e)   # shallow copy; we'll replace sub-objects as needed

    # ── script ────────────────────────────────────────────────────────────────
    if not merged.get('script') and old_e.get('script'):
        merged['script'] = old_e['script']

    # ── definitions ───────────────────────────────────────────────────────────
    old_defs_by_gloss: dict[str, dict] = {}
    for od in old_e.get('definitions', []):
        old_defs_by_gloss[od['gloss']] = od

    new_defs = []
    for nd in merged.get('definitions', []):
        od = old_defs_by_gloss.get(nd['gloss'])
        if od and not nd.get('translations', {}).get('ja') and od.get('translations', {}).get('ja'):
            nd = dict(nd)
            nd['translations'] = dict(nd.get('translations') or {})
            nd['translations']['ja'] = od['translations']['ja']
        new_defs.append(nd)
    merged['definitions'] = new_defs

    # Warn about old definitions not represented in new (skip blanks)
    new_glosses = {nd['gloss'] for nd in merged['definitions']}
    for og in old_defs_by_gloss:
        if og not in new_glosses and og not in BLANK_GLOSSES:
            print(
                f"WARNING [{merged['id']}] old definition not in new dict: {og!r}",
                file=sys.stderr,
            )

    # ── cognates ──────────────────────────────────────────────────────────────
    if 'cognates' in old_e:
        merged['cognates'] = old_e['cognates']

    # ── notes.ja ──────────────────────────────────────────────────────────────
    new_notes_ja = merged.get('notes', {}).get('ja') if merged.get('notes') else None
    old_notes_ja = old_e.get('notes', {}).get('ja') if old_e.get('notes') else None
    if not new_notes_ja and old_notes_ja:
        merged['notes'] = {'ja': old_notes_ja}
    # if both have notes, keep both notes
    if new_notes_ja and old_notes_ja:
        merged['notes']['ja'] = old_notes_ja + "📙" + new_notes_ja

    # ── components ────────────────────────────────────────────────────────────
    if not merged.get('components') and old_e.get('components'):
        merged['components'] = old_e['components']

    return merged


def main():
    with open(NEW_PATH, encoding='utf-8') as f:
        new_data = json.load(f)
    with open(OLD_PATH, encoding='utf-8') as f:
        old_data = json.load(f)

    new_entries: list[dict] = new_data['entries']
    old_entries: list[dict] = old_data['entries']

    new_by_id = {e['id']: e for e in new_entries}
    old_by_id = {e['id']: e for e in old_entries}

    new_ids = set(new_by_id)
    old_ids = set(old_by_id)

    # Build output preserving the order of new_entries, then appending old-only entries.
    output_entries: list[dict] = []

    for ne in new_entries:
        eid = ne['id']
        if eid in old_by_id:
            output_entries.append(merge_entry(ne, old_by_id[eid]))
        else:
            output_entries.append(ne)

    # Entries only in old
    for oe in old_entries:
        eid = oe['id']
        if eid in new_ids:
            continue   # already handled above
        glosses = [d['gloss'] for d in oe.get('definitions', [])]
        all_blank = all(g in BLANK_GLOSSES for g in glosses)
        if not all_blank:
            print(
                f"WARNING [{eid}] old-only entry with real gloss(es) {glosses} — copying as-is",
                file=sys.stderr,
            )
        output_entries.append(oe)

    result = {'entries': output_entries}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(
        f"Wrote {len(output_entries)} entries to {OUT_PATH} "
        f"(new={len(new_ids)}, old={len(old_ids)}, both={len(new_ids & old_ids)}, "
        f"old-only={len(old_ids - new_ids)})",
        file=sys.stderr,
    )


if __name__ == '__main__':
    main()

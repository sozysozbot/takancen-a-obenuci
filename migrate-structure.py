#!/usr/bin/env python3
"""
Migration script: 皇言集書2021-12-11.json → docs/data/dictionary.json format
"""
import json
import re
import sys
from collections import defaultdict
from typing import Optional

POS_MAP = {
    '体言': 'noun',
    '修飾性体言': 'prenominal',
    '用言': 'verb',
    '補助用言': 'auxiliary verb',
    '格助詞': 'noun particle',
    '副助詞': 'noun particle',
    '接続助詞': 'verb particle',
    '助詞': 'noun particle',
    '叫詞': 'sentence particle',
    '人名': 'noun',
    '地名': 'noun',
}

DECLINABLE_POS = {'verb', 'auxiliary verb'}


def parse_cognates(text: str):
    """Parse 'xom1.pk\nshomu.ar' → ({'pk': ['xom1'], 'ar': ['shomu']}, unparseable_lines).
    Lines that don't match 'word.XX' are returned as unparseable_lines so they can go into notes."""
    cognates: dict[str, list[str]] = defaultdict(list)
    unparseable: list[str] = []
    for line in text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        m = re.match(r'^(.*)\.[a-z]{2}$', line)
        if m:
            word = m.group(1)
            lang_code = line.rsplit('.', 1)[1]
            cognates[lang_code].append(word)
        else:
            print(f"INFO: cognate line stored as note: {line!r}", file=sys.stderr)
            unparseable.append(line)
    return dict(cognates), unparseable


def get_conjugation_class(form: str, tags: list) -> Optional[str]:
    if '為活用' in tags:
        return 'c-irregular'
    if form.endswith('-lu'):
        return 'vowel-stem'
    if form.endswith('-u'):
        return 'consonant-stem'
    return None


def migrate(src_path: str) -> dict:
    with open(src_path, encoding='utf-8') as f:
        source = json.load(f)

    words = source['words']

    # First pass: count occurrences of each form for homophone numbering.
    form_total: dict[str, int] = defaultdict(int)
    for w in words:
        form_total[w['entry']['form']] += 1

    form_seen: dict[str, int] = defaultdict(int)
    entries = []

    for w in words:
        form = w['entry']['form']
        old_id = w['entry']['id']

        form_seen[form] += 1
        n = form_seen[form]
        entry_id = form if n == 1 else f"{form}#{n}"

        # ── script ────────────────────────────────────────────────────────────
        script: list[str] = []
        for t in w['translations']:
            if t['title'] == '漢字仮名混じり転写':
                script = t['forms']
                break

        # ── part-of-speech translations (everything that isn't the script) ───
        pos_translations = [t for t in w['translations'] if t['title'] != '漢字仮名混じり転写']

        # ── pos ───────────────────────────────────────────────────────────────
        pos: Optional[str] = None
        for t in pos_translations:
            mapped = POS_MAP.get(t['title'])
            if mapped is not None:
                pos = mapped
                break
            else:
                print(f"WARNING [{entry_id}] unknown pos title: {t['title']!r}", file=sys.stderr)

        if pos is None:
            # Infer from form/variations
            has_variations = bool(w['variations'])
            if has_variations or form.endswith('-lu') or form.endswith('-u'):
                pos = 'verb'
                print(f"WARNING [{entry_id}] inferred pos=verb (old id={old_id})", file=sys.stderr)
            else:
                pos = 'noun'
                print(f"WARNING [{entry_id}] defaulting pos=noun (old id={old_id})", file=sys.stderr)

        # ── conjugation class ─────────────────────────────────────────────────
        conj_class = get_conjugation_class(form, w['tags']) if pos in DECLINABLE_POS else None

        # ── definitions ───────────────────────────────────────────────────────
        # Each non-script translation becomes one Definition.
        # Duplicate pos-title entries (e.g. two '用言' rows) each become their own definition.
        definitions: list[dict] = []
        for t in pos_translations:
            ja_translations = '、'.join(t['forms'])
            definitions.append({'gloss': '(TODO)'})
            definitions.append({'translations': {'ja': ja_translations}})

        if not definitions:
            definitions = [{'gloss': '(未訳)'}]
            print(f"WARNING [{entry_id}] no definitions found (old id={old_id})", file=sys.stderr)

        # ── cognates ──────────────────────────────────────────────────────────
        cognates: Optional[dict] = None
        cognate_content: Optional[str] = None
        for c in w['contents']:
            if c['title'] == '同根語':
                cognate_content = c['text']
                break

        cognate_unparseable: list[str] = []
        if cognate_content is not None:
           
                cognates, cognate_unparseable = parse_cognates(cognate_content)
           

        # ── notes ─────────────────────────────────────────────────────────────
        notes_parts: list[str] = []

        # Non-conjugation tags go into notes
        non_conj_tags = [tag for tag in w['tags'] if tag != '為活用']
        if non_conj_tags:
            notes_parts.append('タグ:' + '、'.join(non_conj_tags))

        # Non-同根語 contents
        for c in w['contents']:
            if c['title'] != '同根語':
                notes_parts.append(f"{c['title']}:{c['text']}")

        # Free-text lines inside a 同根語 block that couldn't be parsed as word.XX
        for line in cognate_unparseable:
            notes_parts.append(f"同根語:{line}")

        notes: Optional[dict] = None
        if notes_parts:
            notes = {'ja': '\n'.join(notes_parts)}

        # ── assemble entry ────────────────────────────────────────────────────
        entry: dict = {'id': entry_id}
        if script:
            entry['script'] = script
        entry['pos'] = pos
        if conj_class is not None:
            entry['conjugation_class'] = conj_class
        entry['definitions'] = definitions
        if notes is not None:
            entry['notes'] = notes
        if cognates:
            entry['cognates'] = cognates

        entries.append(entry)

    return {'entries': entries}


if __name__ == '__main__':
    src = '皇言集書2021-12-11.json'
    result = migrate(src)
    print(json.dumps(result, ensure_ascii=False, indent=2))

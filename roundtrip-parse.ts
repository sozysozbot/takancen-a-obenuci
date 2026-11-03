// Round-trip test: every token in the corpus must be recoverable by the parser.
//
// For each (form, entry_ids) pair in docs/data/corpus.json whose ids all exist
// in the dictionary, we require that
//   1. parseForm(index, form)                 contains { entry_ids, form }, and
//   2. parseForm(index, stripAccents(form))   contains { entry_ids, form }
// (2) is the IME scenario: the user types without accents and the parser must
// still offer the attested analysis with the canonical accented form.
//
// Tokens whose ids are missing from the dictionary are skipped and counted.
// Ambiguity statistics are printed for information only; they are not asserted.

import { readFileSync } from 'fs';
import { buildParserIndex, parseForm, stripAccents } from './docs/parseFormPure.js';
import type { Analysis } from './docs/parseFormPure.js';
import type { CorpusData, DictionaryData } from './docs/types.js';

const dictionary = JSON.parse(readFileSync('docs/data/dictionary.json', 'utf8')) as DictionaryData;
const corpus = JSON.parse(readFileSync('docs/data/corpus.json', 'utf8')) as CorpusData;

const knownIds = new Set(dictionary.entries.map(e => e.id));
const index = buildParserIndex(dictionary.entries);

function sameChain(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
function contains(analyses: Analysis[], entry_ids: readonly string[], form: string): boolean {
  return analyses.some(x => x.form === form && sameChain(x.entry_ids, entry_ids));
}

let checked = 0;
let skippedMissingIds = 0;
const failures: string[] = [];
const ambiguity = new Map<number, number>();
const mostAmbiguous: { form: string; count: number }[] = [];

for (const [si, sentence] of corpus.sentences.entries()) {
  for (const [ti, token] of sentence.tokens.entries()) {
    if ('punctuation' in token) continue;
    const pairs: [string, string[]][] = 'multiple-standard-pronunciations' in token
      ? token.forms.map((form, i): [string, string[]] => [form, token.entry_ids_of_each_form[i] ?? []])
      : [[token.form, token.entry_ids ?? []]];
    for (const [form, entry_ids] of pairs) {
      if (entry_ids.length === 0 || !entry_ids.every(id => knownIds.has(id))) { skippedMissingIds++; continue; }
      checked++;
      const where = `sentences[${si}].tokens[${ti}] ${JSON.stringify(form)} ${JSON.stringify(entry_ids)}`;

      const accented = parseForm(index, form);
      if (!contains(accented, entry_ids, form)) {
        failures.push(`accented input not recovered: ${where}; got ${JSON.stringify(accented.map(a => a.entry_ids))}`);
      }
      const bare = parseForm(index, stripAccents(form));
      if (!contains(bare, entry_ids, form)) {
        failures.push(`accent-stripped input not recovered: ${where}; got ${JSON.stringify(bare.map(a => a.entry_ids))}`);
      }

      ambiguity.set(bare.length, (ambiguity.get(bare.length) ?? 0) + 1);
      mostAmbiguous.push({ form, count: bare.length });
    }
  }
}

console.log(`parse round-trip: ${checked} token forms checked, ${skippedMissingIds} skipped (ids missing from dictionary)`);
console.log('analyses per accent-stripped form:',
  [...ambiguity.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}→${c}`).join('  '));
const top = new Map<string, number>();
for (const { form, count } of mostAmbiguous) top.set(form, count);
console.log('most ambiguous:',
  [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, n]) => `${f}(${n})`).join('  '));

if (failures.length > 0) {
  for (const f of failures) console.error(`❌  ${f}`);
  console.error(`❌  ${failures.length} round-trip failure(s)`);
  process.exit(1);
}
console.log('✅  parse round-trip');

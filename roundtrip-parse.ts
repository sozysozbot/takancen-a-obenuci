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
//
// The console shows a one-screen summary; the full detail (which tokens were
// skipped and why, every competing analysis of the most ambiguous forms, which
// dictionary entries are unattested in the corpus, …) is written to
// test-report.html and opened in the browser. Set CI=1 (GitHub Actions does)
// or NO_OPEN_REPORT=1 to skip opening it.

import { readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { buildParserIndex, parseForm, stripAccents } from './docs/parseFormPure.js';
import type { Analysis } from './docs/parseFormPure.js';
import { planMixedScript, mixedScriptOptions, syllabifyWithCarriers, applyIterationMarks } from './docs/mixedScriptPure.js';
import { latinToSyllabary } from './docs/toSpacedHiraganaPure.js';
import type { CorpusData, DictionaryData } from './docs/types.js';

const REPORT_PATH = 'test-report.html';

const dictionary = JSON.parse(readFileSync('docs/data/dictionary.json', 'utf8')) as DictionaryData;
const corpus = JSON.parse(readFileSync('docs/data/corpus.json', 'utf8')) as CorpusData;

const knownIds = new Set(dictionary.entries.map(e => e.id));
const logographicSources = new Set((corpus.source_urls ?? []).filter(s => s.register === 'logographic').map(s => s.source_name));
const entryMap = new Map(dictionary.entries.map(e => [e.id, e]));
const index = buildParserIndex(dictionary.entries);

// ── Collect ────────────────────────────────────────────────────────────────

interface TokenRef { sentenceIndex: number; tokenIndex: number; source: string; translationJa: string; }
interface SkippedToken extends TokenRef { form: string; entry_ids: string[]; missing: string[]; gloss: string; }
interface Failure extends TokenRef { kind: 'accented' | 'accent-stripped'; form: string; entry_ids: string[]; got: Analysis[]; }
interface AmbiguousForm { form: string; analyses: Analysis[]; }
interface SpellingMiss extends TokenRef { form: string; entry_ids: string[]; mixed_script: string; options: string[]; optionsShown: string[]; }
interface SyllabifyMismatch { form: string; expected: string; got: string; }
interface AcknowledgedSpelling extends TokenRef { form: string; entry_ids: string[]; mixed_script: string; regular: string[]; }

const report = {
  checked: 0,
  skipped: [] as SkippedToken[],
  failures: [] as Failure[],
  ambiguityHistogram: new Map<number, number>(),
  ambiguous: new Map<string, AmbiguousForm>(),
  idUsage: new Map<string, number>(),
  spellingChecked: 0,
  spellingMisses: [] as SpellingMiss[],
  syllabifyMismatches: [] as SyllabifyMismatch[],
  irregular: [] as AcknowledgedSpelling[],
  logographicSkipped: 0,
};

function sameChain(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
function contains(analyses: Analysis[], entry_ids: readonly string[], form: string): boolean {
  return analyses.some(x => x.form === form && sameChain(x.entry_ids, entry_ids));
}

for (const [si, sentence] of corpus.sentences.entries()) {
  for (const [ti, token] of sentence.tokens.entries()) {
    if ('punctuation' in token) continue;
    const ref: TokenRef = { sentenceIndex: si, tokenIndex: ti, source: sentence.source ?? '', translationJa: sentence.translation.ja };
    const pairs: [string, string[], string][] = 'multiple-standard-pronunciations' in token
      ? token.forms.map((form, i): [string, string[], string] => [form, token.entry_ids_of_each_form[i] ?? [], token.gloss])
      : [[token.form, token.entry_ids ?? [], token.gloss ?? '']];
    for (const [form, entry_ids, gloss] of pairs) {
      for (const id of entry_ids) report.idUsage.set(id, (report.idUsage.get(id) ?? 0) + 1);
      const missing = entry_ids.filter(id => !knownIds.has(id));
      if (entry_ids.length === 0 || missing.length > 0) {
        report.skipped.push({ ...ref, form, entry_ids, missing, gloss });
        continue;
      }
      report.checked++;

      const accented = parseForm(index, form);
      if (!contains(accented, entry_ids, form)) report.failures.push({ ...ref, kind: 'accented', form, entry_ids, got: accented });
      const bare = parseForm(index, stripAccents(form));
      if (!contains(bare, entry_ids, form)) report.failures.push({ ...ref, kind: 'accent-stripped', form, entry_ids, got: bare });

      report.ambiguityHistogram.set(bare.length, (report.ambiguityHistogram.get(bare.length) ?? 0) + 1);
      if (bare.length > 1 && !report.ambiguous.has(form)) report.ambiguous.set(form, { form, analyses: bare });

      // The position-aware syllabifier must agree with latinToSyllabary letter for letter.
      const expectedKana = latinToSyllabary(form);
      const gotKana = syllabifyWithCarriers(stripAccents(form).replace(/[-=≡]/g, '')).map(u => u.kana).join('');
      if (expectedKana !== gotKana) report.syllabifyMismatches.push({ form, expected: expectedKana, got: gotKana });

      // Can the spelling mechanism reproduce the corpus's mixed_script? (informational)
      if (!('multiple-standard-pronunciations' in token) && token.mixed_script && token.mixed_script !== '\u3000') {
        const plan = planMixedScript(entryMap, entry_ids);
        const options = plan ? mixedScriptOptions(plan, 'any', 4096) : [];
        if (logographicSources.has(sentence.source ?? '')) {
          report.logographicSkipped++;
        } else if (token.irregular_spelling) {
          report.irregular.push({ ...ref, form, entry_ids, mixed_script: token.mixed_script, regular: plan ? mixedScriptOptions(plan, 'keep') : [] });
        } else {
          report.spellingChecked++;
          if (!options.includes(token.mixed_script)) {
            report.spellingMisses.push({ ...ref, form, entry_ids, mixed_script: token.mixed_script, options, optionsShown: plan ? mixedScriptOptions(plan, 'keep') : [] });
          }
        }
      }
    }
  }
}

const unattestedEntries = dictionary.entries.filter(e => !report.idUsage.has(e.id));
const ambiguousSorted = [...report.ambiguous.values()].sort((a, b) => b.analyses.length - a.analyses.length);
const histogramSorted = [...report.ambiguityHistogram.entries()].sort((a, b) => a[0] - b[0]);

// ── Console summary ────────────────────────────────────────────────────────

console.log(`parse round-trip: ${report.checked} token forms checked, ${report.skipped.length} skipped (ids missing from dictionary), ${unattestedEntries.length} dictionary entries unattested in corpus`);
console.log('analyses per accent-stripped form:', histogramSorted.map(([n, c]) => `${n}→${c}`).join('  '));
console.log('most ambiguous:', ambiguousSorted.slice(0, 8).map(a => `${a.form}(${a.analyses.length})`).join('  '));
console.log(`mixed-script coverage: ${report.spellingChecked - report.spellingMisses.length} / ${report.spellingChecked} corpus spellings reproducible by the per-morpheme mechanism (${report.irregular.length} acknowledged irregular, ${report.logographicSkipped} in logographic-register sources excluded)`);

// ── HTML report ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const code = (s: string) => `<code>${esc(s)}</code>`;
const ids = (list: readonly string[], missing: readonly string[] = []) =>
  list.map(id => missing.includes(id) ? `<code class="missing">${esc(id)}</code>` : code(id)).join(' ');
const where = (r: TokenRef) => `<span class="where">sentences[${r.sentenceIndex}].tokens[${r.tokenIndex}]</span>`;
const analysesList = (list: Analysis[]) =>
  list.length === 0 ? '<em>no analysis</em>'
    : `<ul class="analyses">${list.map(a => `<li>${ids(a.entry_ids)} <span class="arrow">⇒</span> ${code(a.form)}</li>`).join('')}</ul>`;

const hardFailures = report.failures.length + report.syllabifyMismatches.length;
const status = hardFailures === 0 ? 'pass' : 'fail';
const sections: string[] = [];

sections.push(`
<section>
  <h2>Summary</h2>
  <table class="kv">
    <tr><th>Result</th><td class="status-${status}">${status === 'pass' ? '✅ pass' : `❌ ${hardFailures} failure(s)`}</td></tr>
    <tr><th>Token forms checked</th><td>${report.checked}</td></tr>
    <tr><th>Skipped (ids missing from dictionary)</th><td>${report.skipped.length}</td></tr>
    <tr><th>Dictionary entries unattested in corpus</th><td>${unattestedEntries.length} / ${dictionary.entries.length}</td></tr>
    <tr><th>Mixed-script spellings reproducible</th><td>${report.spellingChecked - report.spellingMisses.length} / ${report.spellingChecked} <small>(+${report.irregular.length} acknowledged irregular; ${report.logographicSkipped} tokens in logographic-register sources excluded)</small></td></tr>
    <tr><th>Generated</th><td>${esc(new Date().toLocaleString())}</td></tr>
  </table>
</section>`);

if (report.failures.length > 0) {
  sections.push(`
<section>
  <h2>Round-trip failures</h2>
  <p>The attested analysis was not among the parser's analyses of the form.</p>
  <table>
    <tr><th>Where</th><th>Input</th><th>Form</th><th>Attested ids</th><th>Parser returned</th></tr>
    ${report.failures.map(f => `<tr>
      <td>${where(f)}<br><small>${esc(f.source)}</small></td>
      <td>${f.kind}</td>
      <td>${code(f.form)}</td>
      <td>${ids(f.entry_ids)}</td>
      <td>${analysesList(f.got)}</td>
    </tr>`).join('')}
  </table>
</section>`);
}

sections.push(`
<section>
  <h2>Skipped tokens (${report.skipped.length})</h2>
  <p>These corpus tokens reference ids that are not in the dictionary (the site shows them as red badges). They are excluded from the round-trip check. <code>python3 extract-staging.py</code> drafts entries for them.</p>
  ${report.skipped.length === 0 ? '<p><em>none</em></p>' : `<table>
    <tr><th>Where</th><th>Form</th><th>Entry ids</th><th>Gloss</th><th>Sentence (ja)</th></tr>
    ${report.skipped.map(s => `<tr>
      <td>${where(s)}<br><small>${esc(s.source)}</small></td>
      <td>${code(s.form)}</td>
      <td>${ids(s.entry_ids, s.missing)}</td>
      <td>${esc(s.gloss)}</td>
      <td class="ja">${esc(s.translationJa)}</td>
    </tr>`).join('')}
  </table>`}
</section>`);

if (report.syllabifyMismatches.length > 0) {
  sections.push(`
<section>
  <h2>Syllabifier disagreements with latinToSyllabary (${report.syllabifyMismatches.length})</h2>
  <table>
    <tr><th>Form</th><th>latinToSyllabary</th><th>syllabifyWithCarriers</th></tr>
    ${report.syllabifyMismatches.map(x => `<tr><td>${code(x.form)}</td><td class="ja">${esc(x.expected)}</td><td class="ja">${esc(x.got)}</td></tr>`).join('')}
  </table>
</section>`);
}

sections.push(`
<section>
  <h2>Mixed-script spellings the mechanism cannot reproduce (${report.spellingMisses.length} of ${report.spellingChecked})</h2>
  <p>Informational. The per-morpheme logogram/kana mechanism in <code>mixedScriptPure.ts</code> enumerates the systematic spellings of each analysis; a corpus spelling outside that set is either an irregular register (such as 於冠), a dictionary <code>script</code> that lacks the logogram used, or a gap in the mechanism worth a look.</p>
  <details>
    <summary>Show list</summary>
    <table>
      <tr><th>Where</th><th>Form</th><th>Entry ids</th><th>Corpus spelling</th><th>Mechanism offers (okurigana kept)</th></tr>
      ${report.spellingMisses.map(x => `<tr>
        <td>${where(x)}<br><small>${esc(x.source)}</small></td>
        <td>${code(x.form)}</td>
        <td>${ids(x.entry_ids)}</td>
        <td class="ja">${esc(x.mixed_script)}</td>
        <td class="ja">${x.options.length === 0 ? '<em>nothing</em>' : x.optionsShown.map(esc).join('<br>')}</td>
      </tr>`).join('')}
    </table>
  </details>
</section>`);

sections.push(`
<section>
  <h2>Acknowledged irregular spellings (${report.irregular.length})</h2>
  <p>Tokens flagged <code>irregular_spelling</code>: valid attested spellings the regular mechanism does not derive, so the IME will not offer them. Kept visible here so the knowledge is not lost.</p>
  ${report.irregular.length === 0 ? '<p><em>none</em></p>' : `<table>
    <tr><th>Where</th><th>Form</th><th>Entry ids</th><th>Attested</th><th>Regular spellings</th></tr>
    ${report.irregular.map(x => `<tr>
      <td>${where(x)}<br><small>${esc(x.source)}</small></td>
      <td>${code(x.form)}</td>
      <td>${ids(x.entry_ids)}</td>
      <td class="ja">${esc(x.mixed_script)}</td>
      <td class="ja">${x.regular.map(esc).join('<br>')}</td>
    </tr>`).join('')}
  </table>`}
  <p>Sources in the highly logographic register (excluded from the coverage check): ${[...logographicSources].map(x => `<code>${esc(x)}</code>`).join(', ') || '<em>none</em>'}.</p>
</section>`);

const unmarkedDictionary = dictionary.entries
  .filter(e => !e.avoids_iteration_mark)
  .flatMap(e => (e.script ?? []).filter(x => applyIterationMarks(x) !== x).map(x => ({ id: e.id, spelling: x, marked: applyIterationMarks(x) })));
sections.push(`
<section>
  <h2>Dictionary spellings written without an iteration mark (${unmarkedDictionary.length})</h2>
  <p>Informational. A repeated character inside one word is written ゝ (kana) or 々 (logogram), and the renderer does so from these <code>script</code> values regardless; listed here in case the entry should instead carry <code>avoids_iteration_mark</code> (as たかままに and しし do).</p>
  ${unmarkedDictionary.length === 0 ? '<p><em>none</em></p>' : `<table>
    <tr><th>Id</th><th>As written</th><th>Rendered</th></tr>
    ${unmarkedDictionary.map(x => `<tr><td>${code(x.id)}</td><td class="ja">${esc(x.spelling)}</td><td class="ja">${esc(x.marked)}</td></tr>`).join('')}
  </table>`}
</section>`);

sections.push(`
<section>
  <h2>Ambiguity when parsing accent-stripped forms</h2>
  <p>Number of analyses the parser offers for each accent-stripped corpus form (what a user would type). Forms with several analyses are the ones a composer must present as candidates.</p>
  <table class="histogram">
    <tr>${histogramSorted.map(([n]) => `<th>${n}</th>`).join('')}</tr>
    <tr>${histogramSorted.map(([, c]) => `<td>${c}</td>`).join('')}</tr>
  </table>
  <details open>
    <summary>Most ambiguous forms (${ambiguousSorted.length} forms with more than one analysis; showing up to 40)</summary>
    <table>
      <tr><th>Form</th><th>Analyses</th></tr>
      ${ambiguousSorted.slice(0, 40).map(a => `<tr><td>${code(a.form)}</td><td>${analysesList(a.analyses)}</td></tr>`).join('')}
    </table>
  </details>
</section>`);

sections.push(`
<section>
  <h2>Dictionary entries unattested in the corpus (${unattestedEntries.length})</h2>
  <details>
    <summary>Show list</summary>
    <table>
      <tr><th>Id</th><th>POS</th><th>Script</th><th>Gloss</th></tr>
      ${unattestedEntries.map(e => `<tr>
        <td>${code(e.id)}</td><td>${esc(e.pos)}</td>
        <td class="ja">${esc((e.script ?? []).join(' '))}</td>
        <td>${esc(e.definitions.map(d => d.gloss).join('; '))}</td>
      </tr>`).join('')}
    </table>
  </details>
</section>`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>takancen-a-obenuci — test report</title>
<style>
  :root { color-scheme: light dark; --fg: #1b1b1b; --bg: #fff; --muted: #666; --line: #ddd; --code: #f3f3f3; --bad: #b00020; --ok: #1a7f37; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6e6e6; --bg: #111; --muted: #9a9a9a; --line: #333; --code: #1e1e1e; --bad: #ff6b6b; --ok: #5cd27a; } }
  body { margin: 0; padding: 24px 16px 64px; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif; color: var(--fg); background: var(--bg); max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 22px; margin: 0 0 4px; } h1 small { color: var(--muted); font-weight: normal; }
  h2 { font-size: 18px; margin: 32px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; font-size: 13px; }
  table.kv th { width: 18em; }
  table.histogram { width: auto; } table.histogram th, table.histogram td { text-align: center; min-width: 3em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code); padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
  code.missing { color: var(--bad); outline: 1px solid var(--bad); }
  .where { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--muted); }
  .arrow { color: var(--muted); padding: 0 4px; }
  ul.analyses { margin: 0; padding-left: 1.2em; } ul.analyses li { margin: 2px 0; }
  .status-pass { color: var(--ok); font-weight: 600; } .status-fail { color: var(--bad); font-weight: 600; }
  details summary { cursor: pointer; color: var(--muted); }
  small { color: var(--muted); }
  p { color: var(--muted); margin: 4px 0 8px; }
</style>
</head>
<body>
<h1>takancen-a-obenuci <small>— parse round-trip report</small></h1>
${sections.join('\n')}
</body>
</html>
`;

writeFileSync(REPORT_PATH, html);

// ── Open in the browser (not in CI) ────────────────────────────────────────

if (!process.env['CI'] && !process.env['NO_OPEN_REPORT']) {
  const file = resolve(REPORT_PATH);
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
    : ['xdg-open', [file]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* opening the report is a convenience, never a test failure */ }
}

// ── Exit status ────────────────────────────────────────────────────────────

if (hardFailures > 0) {
  for (const x of report.syllabifyMismatches) {
    console.error(`❌  syllabifier mismatch: ${JSON.stringify(x.form)} latinToSyllabary=${x.expected} syllabifyWithCarriers=${x.got}`);
  }
  for (const f of report.failures) {
    console.error(`❌  ${f.kind} input not recovered: sentences[${f.sentenceIndex}].tokens[${f.tokenIndex}] ${JSON.stringify(f.form)} ${JSON.stringify(f.entry_ids)}`);
  }
  console.error(`❌  ${hardFailures} failure(s) — details in ${REPORT_PATH}`);
  process.exit(1);
}
console.log(`✅  parse round-trip — details in ${REPORT_PATH}`);

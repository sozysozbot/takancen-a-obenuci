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
import type { CorpusData, DictionaryData } from './docs/types.js';

const REPORT_PATH = 'test-report.html';

const dictionary = JSON.parse(readFileSync('docs/data/dictionary.json', 'utf8')) as DictionaryData;
const corpus = JSON.parse(readFileSync('docs/data/corpus.json', 'utf8')) as CorpusData;

const knownIds = new Set(dictionary.entries.map(e => e.id));
const index = buildParserIndex(dictionary.entries);

// ── Collect ────────────────────────────────────────────────────────────────

interface TokenRef { sentenceIndex: number; tokenIndex: number; source: string; translationJa: string; }
interface SkippedToken extends TokenRef { form: string; entry_ids: string[]; missing: string[]; gloss: string; }
interface Failure extends TokenRef { kind: 'accented' | 'accent-stripped'; form: string; entry_ids: string[]; got: Analysis[]; }
interface AmbiguousForm { form: string; analyses: Analysis[]; }

const report = {
  checked: 0,
  skipped: [] as SkippedToken[],
  failures: [] as Failure[],
  ambiguityHistogram: new Map<number, number>(),
  ambiguous: new Map<string, AmbiguousForm>(),
  idUsage: new Map<string, number>(),
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

// ── HTML report ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const code = (s: string) => `<code>${esc(s)}</code>`;
const ids = (list: readonly string[], missing: readonly string[] = []) =>
  list.map(id => missing.includes(id) ? `<code class="missing">${esc(id)}</code>` : code(id)).join(' ');
const where = (r: TokenRef) => `<span class="where">sentences[${r.sentenceIndex}].tokens[${r.tokenIndex}]</span>`;
const analysesList = (list: Analysis[]) =>
  list.length === 0 ? '<em>no analysis</em>'
    : `<ul class="analyses">${list.map(a => `<li>${ids(a.entry_ids)} <span class="arrow">⇒</span> ${code(a.form)}</li>`).join('')}</ul>`;

const status = report.failures.length === 0 ? 'pass' : 'fail';
const sections: string[] = [];

sections.push(`
<section>
  <h2>Summary</h2>
  <table class="kv">
    <tr><th>Result</th><td class="status-${status}">${status === 'pass' ? '✅ pass' : `❌ ${report.failures.length} failure(s)`}</td></tr>
    <tr><th>Token forms checked</th><td>${report.checked}</td></tr>
    <tr><th>Skipped (ids missing from dictionary)</th><td>${report.skipped.length}</td></tr>
    <tr><th>Dictionary entries unattested in corpus</th><td>${unattestedEntries.length} / ${dictionary.entries.length}</td></tr>
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

sections.push(`
<section>
  <h2>Accent-stripped ambiguity</h2>
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

if (report.failures.length > 0) {
  for (const f of report.failures) {
    console.error(`❌  ${f.kind} input not recovered: sentences[${f.sentenceIndex}].tokens[${f.tokenIndex}] ${JSON.stringify(f.form)} ${JSON.stringify(f.entry_ids)}`);
  }
  console.error(`❌  ${report.failures.length} round-trip failure(s) — details in ${REPORT_PATH}`);
  process.exit(1);
}
console.log(`✅  parse round-trip — details in ${REPORT_PATH}`);

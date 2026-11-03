// ── Entry-id chain → mixed-script spellings ────────────────────────────────
//
// Given an analysis such as ["cík-", "(é)m-", "(u)"], this module works out
// how the word can be written in the mixed logogram + syllabary script:
//
//     cikému  →  席けむ   (席 for cík-, the rest in kana)
//             →  席在む   (席 for cík-, 在 for (é)m- replacing its slot kana け)
//             →  しけむ   (all kana)
//
// The mechanism, read off the corpus and the dictionary's `script` convention:
//
//  * The word's kana spelling is split into *units* (one kana, or Ci+small-vowel
//    for CjV). Each unit belongs to the morpheme that owns its vowel. So a
//    morpheme-final consonant joins the next morpheme's vowel and that unit
//    belongs to the next morpheme: in 集で入た (tád- (e)nít- (a)), で is d+e where
//    e is the slot vowel of (e)nít-.
//  * Within an auxiliary, the slot vowel's unit (で, ら in 筆ら終) is *slot* and is
//    always written in kana; the units of the fixed part are *core*.
//  * A morpheme's logogram replaces exactly its core units. A morpheme whose core
//    has no vowel (ć-, (á)c-, (í)-) takes one adjacent unit as its core instead:
//    the following unit for a stem (cóla → 為ら), its own slot unit for an
//    auxiliary (cemalácu → 言能す, utílu → 下心る).
//  * For verbs and auxiliaries the dictionary's `script` holds the (u)-form
//    spelling; the logogram is what remains after stripping its one-kana ending
//    (在む → 在, 能す → 能, 善まる → 善ま, やる → nothing: kana-only).
//  * After a logogram, the kana that merely spell a slot vowel or a bare ending
//    ((a) (e) (i) (u)) may be omitted — 「e性語基は、タカン文字を送らずに燐字だけで
//    書くことが比較的多めである」 — giving 無 for wáca, 口行 for jamemóke, 上行 for
//    comóku. `omittableUnits` lists such units; `renderMixedScript` takes the
//    set actually omitted.
//  * Nominal chains (tákan =cen, on≡ ≡co, ká ki) concatenate each id's spelling.
//  * A repeated character is written with an iteration mark: ゝ for kana (うぬゝ,
//    あまゝ, えゝ — never ええ), 々 for logograms (行々). The mark must not blur a
//    boundary between two words, so it is applied within a *segment*: a verb
//    stem together with its verb particles is one segment (うぬゝ: nothing can
//    pause between únun- and -u), each auxiliary verb starts a new one (行行けむ:
//    moŕ- + (e)mók- are distinct words despite the shared etymology), and each
//    id of a nominal chain is its own segment (筆しし: kúwa + =cici). An entry
//    flagged `avoids_iteration_mark` (たかままに, a compound; しし, a loanword) is
//    written without marks even inside its segment.
//
// Nothing here decides *which* spelling to use; it enumerates what is possible.

import { conjugateAndJoinPure, getStemClassFromId, stripHomophoneDisambiguator, SUFFIX_VOWEL } from './conjugateAndJoinPure.js';
import { CV_TABLE, VOWELS, latinToSyllabary } from './toSpacedHiraganaPure.js';
import { stripAccents } from './parseFormPure.js';
import type { DictionaryEntry } from './types.js';

export interface ScriptUnit {
  kana: string;
  /** index into `MixedScriptPlan.morphemes` */
  owner: number;
  role: 'core' | 'slot';
}

export interface MorphemeSpelling {
  id: string;
  /** spellings that may replace this morpheme's core units; empty → kana only */
  logograms: string[];
  /** true when this morpheme begins a new word-like segment for iteration-mark purposes */
  startsSegment: boolean;
  /** dictionary flag: never write ゝ/々 inside this morpheme's material */
  avoidsIterationMark: boolean;
}

export interface MixedScriptPlan {
  entry_ids: string[];
  form: string;
  units: ScriptUnit[];
  morphemes: MorphemeSpelling[];
}

/** One chosen spelling per morpheme: a string from `logograms`, or null for kana. */
export type SpellingChoice = (string | null)[];

const BARE_ENDING = /^\([aeiuáéíú]\)$/;

/** Indices of units whose kana may be omitted after a logogram: slot vowels and bare endings. */
export function omittableUnits(plan: MixedScriptPlan): number[] {
  const out: number[] = [];
  plan.units.forEach((u, i) => {
    const bareEnding = BARE_ENDING.test(stripHomophoneDisambiguator(plan.morphemes[u.owner]!.id));
    if (u.role === 'slot' || bareEnding) out.push(i);
  });
  return out;
}

// The (u)-form ending written in a verb/auxiliary `script` is always exactly one
// kana (る / C+u / す), so exactly one is stripped: 善まる → 善ま, 在む → 在.
const ONE_TRAILING_KANA = /[\u3040-\u309f\u30fc\u309d\u309e]$/;
const NON_KANA = /[^\u3040-\u309f\u30fc\u309d\u309e]/;

function isVerbId(id: string): boolean {
  const base = stripHomophoneDisambiguator(id);
  return base.endsWith('-') && !base.startsWith('(');
}

function logogramsOf(entry: DictionaryEntry | undefined, kind: 'verbal' | 'nominal'): string[] {
  if (!entry?.script) return [];
  const out: string[] = [];
  for (const s of entry.script) {
    if (s === '' || s === '　') continue;
    if (kind === 'nominal') { out.push(s); continue; }
    const stripped = s.replace(ONE_TRAILING_KANA, '');
    if (NON_KANA.test(stripped)) out.push(stripped);
  }
  return [...new Set(out)];
}

// ── Position-aware syllabification ─────────────────────────────────────────
// Mirrors `latinToSyllabary` exactly (roundtrip-parse asserts this), but keeps
// the index of the letter that carries each unit (its vowel, or the letter
// itself for ん/っ/ー), so units can be assigned to morphemes.

interface RawUnit { kana: string; carrier: number; }

const SMALL_VOWEL: Record<string, string> = { a: 'ぁ', i: 'ぃ', u: 'ぅ', e: 'ぇ', o: 'ぉ' };

export function syllabifyWithCarriers(text: string): RawUnit[] {
  // Step 1: the same string rewrites as latinToSyllabary, carrying the index of
  // the original letter each rewritten character stands for.
  type Ch = { c: string; idx: number };
  let chars: Ch[] = [...text.toLowerCase()].map((c, idx) => ({ c, idx }));
  const rewrite = (f: (cs: Ch[], i: number) => Ch[] | null) => {
    const out: Ch[] = [];
    for (let i = 0; i < chars.length;) {
      const r = f(chars, i);
      if (r) { out.push(...r.filter(x => x.c !== '')); i += r.length; } else { out.push(chars[i]!); i++; }
    }
    chars = out;
  };
  // or → ou
  rewrite((cs, i) => cs[i]!.c === 'o' && cs[i + 1]?.c === 'r' ? [cs[i]!, { c: 'u', idx: cs[i + 1]!.idx }] : null);
  // (?<=[kgcstdnbpml])jur → iu   (the u is dropped; i takes its place)
  rewrite((cs, i) => i > 0 && 'kgcstdnbpml'.includes(cs[i - 1]!.c) && cs[i]!.c === 'j' && cs[i + 1]?.c === 'u' && cs[i + 2]?.c === 'r'
    ? [{ c: 'i', idx: cs[i + 1]!.idx }, { c: '', idx: -1 }, { c: 'u', idx: cs[i + 2]!.idx }] : null);
  // ur → uu
  rewrite((cs, i) => cs[i]!.c === 'u' && cs[i + 1]?.c === 'r' ? [cs[i]!, { c: 'u', idx: cs[i + 1]!.idx }] : null);
  // r → ー
  chars = chars.map(ch => ch.c === 'r' ? { c: 'ー', idx: ch.idx } : ch);

  // Step 2: the same tokenisation loop as latinToSyllabary; the carrier of a
  // unit is its vowel letter, or the letter itself for ん / っ / ー.
  const t = chars.map(ch => ch.c).join('');
  const units: RawUnit[] = [];
  let i = 0;
  while (i < t.length) {
    const ciKana = t[i + 1] === 'j' ? CV_TABLE[t[i] + 'i'] : undefined;
    const smallV = ciKana ? SMALL_VOWEL[t[i + 2] ?? ''] : undefined;
    if (ciKana && smallV) { units.push({ kana: ciKana + smallV, carrier: chars[i + 2]!.idx }); i += 3; continue; }
    const cv2 = t[i + 1] !== undefined ? t[i]! + t[i + 1]! : '';
    if (CV_TABLE[cv2]) { units.push({ kana: CV_TABLE[cv2]!, carrier: chars[i + 1]!.idx }); i += 2; continue; }
    if (t[i] === 'n' && !VOWELS.has(t[i + 1]!)) { units.push({ kana: 'ん', carrier: chars[i]!.idx }); i++; continue; }
    if (VOWELS.has(t[i]!) && CV_TABLE[t[i]!]) { units.push({ kana: CV_TABLE[t[i]!]!, carrier: chars[i]!.idx }); i++; continue; }
    if (t[i] === 'x') { units.push({ kana: 'っ', carrier: chars[i]!.idx }); i++; continue; }
    units.push({ kana: t[i]!, carrier: chars[i]!.idx }); i++;
  }
  return units;
}

// ── Planning ───────────────────────────────────────────────────────────────

export function planMixedScript(entries: ReadonlyMap<string, DictionaryEntry>, entry_ids: string[]): MixedScriptPlan | null {
  if (entry_ids.length === 0) return null;
  return isVerbId(entry_ids[0]!) ? planVerbal(entries, entry_ids) : planNominal(entries, entry_ids);
}

function planVerbal(entries: ReadonlyMap<string, DictionaryEntry>, entry_ids: string[]): MixedScriptPlan | null {
  const form = generateQuietly(entry_ids);
  if (form === null) return null;

  // Tag every letter of the accent-stripped form with (morpheme, role).
  const tags: { owner: number; role: 'core' | 'slot' }[] = [];
  let text = '';
  const push = (s: string, owner: number, role: 'core' | 'slot') => { for (const _ of s) tags.push({ owner, role }); text += s; };

  push(stripAccents(stripHomophoneDisambiguator(entry_ids[0]!).replace(/-$/, '')), 0, 'core');
  for (let i = 1; i < entry_ids.length; i++) {
    const id = entry_ids[i]!;
    const base = stripHomophoneDisambiguator(id);
    const m = (base.endsWith('-') ? base.slice(0, -1) : base).match(/^\(([aeiuáéíú])\)(.*)$/);
    if (!m) return null;
    let stemClass; try { stemClass = getStemClassFromId(entry_ids[i - 1]!); } catch { return null; }
    const vowel = m[1] as keyof (typeof SUFFIX_VOWEL)['consonant-stem'];
    push(stripAccents(SUFFIX_VOWEL[stemClass][vowel]), i, 'slot');
    push(stripAccents(m[2]!), i, 'core');
  }
  if (text !== stripAccents(form)) return null;

  const units: ScriptUnit[] = syllabifyWithCarriers(text).map(u => {
    const tag = tags[u.carrier]!;
    return { kana: u.kana, owner: tag.owner, role: tag.role };
  });

  // A morpheme whose core owns no unit takes an adjacent unit as its core.
  for (let m = 0; m < entry_ids.length; m++) {
    if (units.some(u => u.owner === m && u.role === 'core')) continue;
    if (m === 0) {
      const next = units.find(u => u.owner > 0);
      if (next) { next.owner = 0; next.role = 'core'; }
    } else {
      const slot = units.find(u => u.owner === m && u.role === 'slot');
      if (slot) slot.role = 'core';
    }
  }

  const morphemes: MorphemeSpelling[] = entry_ids.map((id, i) => {
    const entry = entries.get(id);
    return {
      id,
      logograms: logogramsOf(entry, 'verbal'),
      startsSegment: i === 0 || entry?.pos === 'auxiliary verb',
      avoidsIterationMark: entry?.avoids_iteration_mark === true,
    };
  });
  return { entry_ids, form, units, morphemes };
}

function planNominal(entries: ReadonlyMap<string, DictionaryEntry>, entry_ids: string[]): MixedScriptPlan | null {
  const form = generateQuietly(entry_ids);
  if (form === null) return null;
  const units: ScriptUnit[] = [];
  const morphemes: MorphemeSpelling[] = [];
  entry_ids.forEach((id, m) => {
    const display = stripHomophoneDisambiguator(id).replace(/[=≡]/g, '');
    const entry = entries.get(id);
    units.push({ kana: latinToSyllabary(display), owner: m, role: 'core' });
    morphemes.push({ id, logograms: logogramsOf(entry, 'nominal'), startsSegment: true, avoidsIterationMark: entry?.avoids_iteration_mark === true });
  });
  return { entry_ids, form, units, morphemes };
}

function generateQuietly(entry_ids: string[]): string | null {
  const { warn, log } = console;
  console.warn = () => {}; console.log = () => {};
  try { return conjugateAndJoinPure(entry_ids) ?? null; }
  catch { return null; }
  finally { console.warn = warn; console.log = log; }
}

// ── Rendering ──────────────────────────────────────────────────────────────

const KANA_CHAR = /[\u3040-\u309f\u30fc]/;

/**
 * Write a repeated character with its iteration mark: ゝ after a kana, 々 after
 * a logogram. Characters that are already marks are left alone.
 */
export function applyIterationMarks(s: string): string {
  let out = '';
  let prev = '';
  for (const ch of s) {
    if (ch === prev && ch !== 'ゝ' && ch !== '々') out += KANA_CHAR.test(ch) ? 'ゝ' : '々';
    else out += ch;
    prev = ch;
  }
  return out;
}

/**
 * Render with one spelling per morpheme. Units in `omitted` are left out, but
 * only where the preceding written material is a logogram (an omitted unit
 * elsewhere is written normally, so the result is always readable).
 */
export function renderMixedScript(plan: MixedScriptPlan, choice: SpellingChoice, omitted: ReadonlySet<number> = new Set()): string {
  return renderMixedScriptSegments(plan, choice, omitted).map(s => s.text).join('');
}

/**
 * A piece of the written word: a logogram together with the kana it stands for
 * (for ruby), or a run of kana written as such (`reading` null).
 */
export interface SpellingSegment {
  text: string;
  reading: string | null;
}

export function renderMixedScriptSegments(plan: MixedScriptPlan, choice: SpellingChoice, omitted: ReadonlySet<number> = new Set()): SpellingSegment[] {
  // Iteration marks apply inside a word-like segment and never across two, so
  // each piece remembers which such segment it belongs to.
  const segmentOf = (owner: number) => { let seg = 0; for (let m = 1; m <= owner; m++) if (plan.morphemes[m]!.startsSegment) seg = m; return seg; };
  interface Piece { seg: number; text: string; reading: string | null; owner: number }
  const pieces: Piece[] = [];
  const emitted = new Set<number>();
  let lastWasLogogram = false;
  plan.units.forEach((u, i) => {
    const chosen = u.role === 'core' ? choice[u.owner] ?? null : null;
    const last = pieces[pieces.length - 1];
    if (chosen === null) {
      if (omitted.has(i) && lastWasLogogram) {
        // Omitted okurigana is still read: it joins the reading of the logogram before it.
        if (last && last.reading !== null) last.reading += u.kana;
        return;
      }
      if (last && last.reading === null && last.seg === segmentOf(u.owner)) last.text += u.kana;
      else pieces.push({ seg: segmentOf(u.owner), text: u.kana, reading: null, owner: u.owner });
      lastWasLogogram = false;
      return;
    }
    if (!emitted.has(u.owner)) {
      // A spelling that is itself kana (a nominal `script` such as しし) needs no reading.
      pieces.push({ seg: segmentOf(u.owner), text: chosen, reading: NON_KANA.test(chosen) ? u.kana : null, owner: u.owner });
      emitted.add(u.owner);
    } else if (last && last.owner === u.owner && last.reading !== null) {
      last.reading += u.kana;   // further core units of the same logogram
    }
    lastWasLogogram = true;
  });

  // Apply iteration marks over each word-like segment's text as a whole, then
  // hand the characters back to the pieces (a mark replaces exactly one character).
  const out: SpellingSegment[] = [];
  let i = 0;
  while (i < pieces.length) {
    let j = i;
    while (j < pieces.length && pieces[j]!.seg === pieces[i]!.seg) j++;
    const group = pieces.slice(i, j);
    const avoids = plan.morphemes.some((m, k) => segmentOf(k) === pieces[i]!.seg && m.avoidsIterationMark);
    const marked = [...(avoids ? group.map(p => p.text).join('') : applyIterationMarks(group.map(p => p.text).join('')))];
    let pos = 0;
    for (const p of group) {
      const len = [...p.text].length;
      out.push({ text: marked.slice(pos, pos + len).join(''), reading: p.reading === null ? null : (avoids ? p.reading : applyIterationMarks(p.reading)) });
      pos += len;
    }
    i = j;
  }
  return out;
}

/**
 * The segments of a given spelling, found by enumerating the choices that
 * could have produced it; null when no systematic choice does (a custom or
 * irregular spelling), in which case the caller has no per-logogram readings.
 */
export function spellingSegments(plan: MixedScriptPlan, spelling: string, cap = 4096): SpellingSegment[] | null {
  const perMorpheme = plan.morphemes.map(m => [...m.logograms, null]);
  const omissionSets = subsets(omittableUnits(plan)).map(xs => new Set(xs));
  let tried = 0;
  const choice: SpellingChoice = [];
  const walk = (m: number): SpellingSegment[] | null => {
    if (m === perMorpheme.length) {
      for (const omitted of omissionSets) {
        if (tried++ >= cap) return null;
        const segments = renderMixedScriptSegments(plan, choice, omitted);
        if (segments.map(s => s.text).join('') === spelling) return segments;
      }
      return null;
    }
    for (const opt of perMorpheme[m]!) { choice[m] = opt; const r = walk(m + 1); if (r) return r; }
    return null;
  };
  return walk(0);
}

/** The all-kana spelling. */
export function kanaSpelling(plan: MixedScriptPlan): string {
  return renderMixedScript(plan, plan.morphemes.map(() => null));
}

/** Logogram for every morpheme that has one (first listed), kana elsewhere. */
export function logographicChoice(plan: MixedScriptPlan): SpellingChoice {
  return plan.morphemes.map(m => m.logograms[0] ?? null);
}

/**
 * Every distinct spelling reachable by choosing, per morpheme, one of its
 * logograms or kana. Ordered most-logographic first. Capped to keep the
 * candidate window sane for long chains.
 *
 * `okurigana`: 'keep' writes every kana; 'omit' also adds, for each spelling,
 * the variant with every omittable unit dropped; 'any' enumerates every subset
 * of omittable units (for coverage checks, not for a candidate window).
 */
export function mixedScriptOptions(plan: MixedScriptPlan, okurigana: 'keep' | 'omit' | 'any' = 'omit', cap = 64): string[] {
  const perMorpheme = plan.morphemes.map(m => [...m.logograms, null]);
  const omittable = omittableUnits(plan);
  const omissionSets: ReadonlySet<number>[] = okurigana === 'keep' ? [new Set()]
    : okurigana === 'omit' ? [new Set(), new Set(omittable)]
    : subsets(omittable).map(xs => new Set(xs));
  const results: string[] = [];
  const seen = new Set<string>();
  const choice: SpellingChoice = [];
  const walk = (m: number) => {
    if (results.length >= cap) return;
    if (m === perMorpheme.length) {
      for (const omitted of omissionSets) {
        const s = renderMixedScript(plan, choice, omitted);
        if (!seen.has(s)) { seen.add(s); results.push(s); }
      }
      return;
    }
    for (const opt of perMorpheme[m]!) { choice[m] = opt; walk(m + 1); }
  };
  walk(0);
  return results;
}

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [[]];
  for (const x of xs) for (const s of [...out]) out.push([...s, x]);
  return out;
}

// ── Self-tests ─────────────────────────────────────────────────────────────

const TEST_DICT = new Map<string, DictionaryEntry>([
  ['cík-',   { id: 'cík-',   pos: 'verb', conjugation_class: 'consonant-stem', script: ['席く'], definitions: [] }],
  ['tád-',   { id: 'tád-',   pos: 'verb', conjugation_class: 'consonant-stem', script: ['集づ'], definitions: [] }],
  ['ká-',    { id: 'ká-',    pos: 'verb', conjugation_class: 'vowel-stem',     script: ['筆る'], definitions: [] }],
  ['céma-',  { id: 'céma-',  pos: 'verb', conjugation_class: 'vowel-stem',     script: ['言る'], definitions: [] }],
  ['út-',    { id: 'út-',    pos: 'verb', conjugation_class: 'consonant-stem', script: ['下つ'], definitions: [] }],
  ['ć-',     { id: 'ć-',     pos: 'verb', conjugation_class: 'c-irregular',    script: ['為'],  definitions: [] }],
  ['únun-',  { id: 'únun-',  pos: 'verb', conjugation_class: 'consonant-stem', script: ['うぬゝ'], definitions: [] }],
  ['wác-',   { id: 'wác-',   pos: 'verb', conjugation_class: 'consonant-stem', script: ['無す'], definitions: [] }],
  ['comók-', { id: 'comók-', pos: 'verb', conjugation_class: 'consonant-stem', script: ['上行く'], definitions: [] }],
  ['ketéma-',{ id: 'ketéma-',pos: 'verb', conjugation_class: 'vowel-stem',     script: ['善在る', '善まる'], definitions: [] }],
  ['(e)có-', { id: '(e)có-', pos: 'auxiliary verb', conjugation_class: 'vowel-stem', script: ['上る'], definitions: [] }],
  ['mormoŕ-',{ id: 'mormoŕ-',pos: 'verb', conjugation_class: 'vowel-stem',     script: ['行行る'], definitions: [] }],
  ['moŕ-',   { id: 'moŕ-',   pos: 'verb', conjugation_class: 'vowel-stem',     script: ['行る'], definitions: [] }],
  ['(e)mók-',{ id: '(e)mók-',pos: 'auxiliary verb', conjugation_class: 'consonant-stem', script: ['行く'], definitions: [] }],
  ['kúwa',   { id: 'kúwa',   pos: 'noun', script: ['筆'], definitions: [] }],
  ['=cici',  { id: '=cici',  pos: 'noun suffix', script: ['しし'], definitions: [], avoids_iteration_mark: true }],
  ['takamámani', { id: 'takamámani', pos: 'noun', script: ['皇字'], definitions: [], avoids_iteration_mark: true }],
  ['ámama',  { id: 'ámama',  pos: 'noun', script: ['大'], definitions: [] }],
  ['(é)m-',  { id: '(é)m-',  pos: 'auxiliary verb', conjugation_class: 'consonant-stem', script: ['在む'], definitions: [] }],
  ['(e)nít-',{ id: '(e)nít-',pos: 'auxiliary verb', conjugation_class: 'consonant-stem', script: ['入つ'], definitions: [] }],
  ['(á)c-',  { id: '(á)c-',  pos: 'auxiliary verb', conjugation_class: 'c-irregular',    script: ['す', '能す'], definitions: [] }],
  ['(í)-',   { id: '(í)-',   pos: 'auxiliary verb', conjugation_class: 'vowel-stem',     script: ['る', '心る'], definitions: [] }],
  ['(a)ta',  { id: '(a)ta',  pos: 'verb particle', script: ['終'], definitions: [] }],
  ['(u)',    { id: '(u)',    pos: 'verb particle', definitions: [] }],
  ['(a)',    { id: '(a)',    pos: 'verb particle', definitions: [] }],
  ['tákan',  { id: 'tákan',  pos: 'noun', script: ['皇'], definitions: [] }],
  ['=cen',   { id: '=cen',   pos: 'noun suffix', script: ['言'], definitions: [] }],
  ['kan',    { id: 'kan',    pos: 'noun particle', script: ['かん', '処'], definitions: [] }],
]);

function options(ids: string[], okurigana: 'keep' | 'omit' | 'any' = 'keep'): string[] {
  const plan = planMixedScript(TEST_DICT, ids);
  return plan ? mixedScriptOptions(plan, okurigana) : [];
}
function sameList(a: string[], b: string[]): boolean { return a.length === b.length && a.every((x, i) => x === b[i]); }

console.assert(sameList(options(['cík-', '(é)m-', '(u)']), ['席在む', '席けむ', 'し在む', 'しけむ']));   // (é)m- takes its slot け, as 在む/能す/心る in the dictionary
console.assert(sameList(options(['tád-', '(e)nít-', '(a)']), ['集で入た', '集でにた', 'たで入た', 'たでにた']));
console.assert(sameList(options(['ká-', '(a)ta']), ['筆ら終', '筆らた', 'から終', 'からた']));
console.assert(sameList(options(['ć-', '(a)']), ['為ら', 'そら']));                    // vowel-less stem takes そ
console.assert(sameList(options(['céma-', '(á)c-', '(u)']), ['言能す', '言らす', 'せま能す', 'せまらす'])); // (á)c- takes its slot ら
console.assert(sameList(options(['út-', '(í)-', '(u)']), ['下心る', '下ちる', 'う心る', 'うちる']));     // (í)- takes its slot ち
console.assert(sameList(options(['tákan', '=cen']), ['皇言', '皇せん', 'たかん言', 'たかんせん']));
console.assert(sameList(options(['kan']), ['かん', '処']));
// Okurigana omission after a logogram: 無 for wáca, 上行 for comóku; never in kana spellings.
console.assert(sameList(options(['wác-', '(a)'], 'omit'), ['無さ', '無', 'わさ']));
console.assert(sameList(options(['comók-', '(u)'], 'omit'), ['上行く', '上行', 'そもく']));
console.assert(options(['cík-', '(e)có-', '(a)'], 'any').includes('席上ら'));   // け omitted, ら kept
console.assert(sameList(options(['ketéma-', '(u)']), ['善在る', '善まる', 'けてまる']));   // one-kana strip keeps 善ま
// Iteration marks within a morpheme only.
console.assert(applyIterationMarks('うぬぬ') === 'うぬゝ');
console.assert(applyIterationMarks('ええ') === 'えゝ');
console.assert(applyIterationMarks('行行') === '行々');
console.assert(applyIterationMarks('再々') === '再々');
console.assert(sameList(options(['únun-', '(u)']), ['うぬゝ']));
console.assert(sameList(options(['mormoŕ-', '(e)']), ['行々', 'もうもう']));
console.assert(sameList(options(['moŕ-', '(e)mók-', '(é)m-', '(u)']).slice(0, 2), ['行行在む', '行行けむ']));   // verb + auxiliary: two words, no mark
console.assert(sameList(options(['kúwa', '=cici']), ['筆しし', 'くわしし']));                              // =cici avoids the mark
console.assert(sameList(options(['takamámani']), ['皇字', 'たかままに']));                                 // flagged compound
console.assert(sameList(options(['ámama']), ['大', 'あまゝ']));
// Segments: logograms carry the kana they stand for, including omitted okurigana.
const seg = (ids: string[], spelling: string) => spellingSegments(planMixedScript(TEST_DICT, ids)!, spelling)?.map(x => x.reading === null ? x.text : `${x.text}(${x.reading})`).join('|') ?? null;
console.assert(seg(['cík-', '(é)m-', '(u)'], '席けむ') === '席(し)|けむ');
console.assert(seg(['tád-', '(e)nít-', '(a)'], '集で入た') === '集(た)|で|入(に)|た');
console.assert(seg(['wác-', '(a)'], '無') === '無(わさ)');
console.assert(seg(['kúwa', '=cici'], '筆しし') === '筆(くわ)|しし');
console.assert(seg(['únun-', '(u)'], 'うぬゝ') === 'うぬゝ');
console.assert(seg(['mormoŕ-', '(e)'], '行々') === '行々(もうもう)');
console.assert(seg(['cík-', '(é)m-', '(u)'], '席在') === '席(し)|在(けむ)');      // the logographic register, む omitted
console.assert(seg(['cík-', '(é)m-', '(u)'], '座けむ') === null);                // not a systematic spelling
console.assert(syllabifyWithCarriers('kaxcen').map(u => u.kana).join('') === latinToSyllabary('káxcen'));
console.assert(syllabifyWithCarriers('morlata').map(u => u.kana).join('') === latinToSyllabary('moŕlata'));
console.assert(syllabifyWithCarriers('kjabetu').map(u => u.kana).join('') === latinToSyllabary('kjábetu'));

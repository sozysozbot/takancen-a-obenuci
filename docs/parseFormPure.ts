// ── Romanized form → dictionary entry-id chains ────────────────────────────
//
// This module is the inverse of `conjugateAndJoinPure`:
//
//     conjugateAndJoinPure(["cík-", "(é)m-", "(u)"]) === "cikému"
//     parseForm(index, "cikemu")  ∋  { entry_ids: ["cík-", "(é)m-", "(u)"], form: "cikému" }
//
// It is deliberately *generate-and-check*: candidate chains are enumerated by
// cheap prefix matching on accent-stripped strings, and every candidate is then
// verified by running the real generator and comparing. Consequently the parser
// cannot accept anything the generator would not produce, and the two can never
// disagree about accent placement or stem-class transitions.
//
// The typed input may omit accents (the common case when typing quickly); the
// returned `form` is always the canonical accented form from the generator, and
// `exact` records whether the input already matched it character for character.
//
// This module encodes no grammar of its own beyond what the dictionary ids and
// `SUFFIX_VOWEL` already encode. Which auxiliaries may follow which stems is a
// consequence of the `(vowel)` slot in each auxiliary id, not a rule written here.

import {
  conjugateAndJoinPure,
  getStemClassFromId,
  stripHomophoneDisambiguator,
  SUFFIX_VOWEL,
} from './conjugateAndJoinPure.js';
import type { DictionaryEntry, ConjugationClass } from './types.js';

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

type SuffixVowel = keyof (typeof SUFFIX_VOWEL)['consonant-stem'];

interface AuxiliaryShape {
  id: string;
  vowel: SuffixVowel;
  fixed: string;   // the part after the "(v)" slot, dash removed
  hasDash: boolean; // true → another suffix must follow
}

interface VerbStemShape {
  id: string;
  stem: string;    // accent-stripped, homophone marker and trailing dash removed
}

export interface ParserIndex {
  verbStems: VerbStemShape[];
  auxiliaries: AuxiliaryShape[];
  /** accent-stripped, homophone-stripped display key → every id that has that key */
  nominals: Map<string, string[]>;
  /** the keys of `nominals`, longest first (so greedy prefix scans find long phrases) */
  nominalKeys: string[];
}

export interface Analysis {
  entry_ids: string[];
  /** canonical form, as produced by `conjugateAndJoinPure` */
  form: string;
  /** whether the typed input already equalled `form` (accents included) */
  exact: boolean;
}

const MAX_SUFFIX_DEPTH = 6;
const MAX_NOMINAL_CHAIN = 4;

export function buildParserIndex(entries: readonly DictionaryEntry[]): ParserIndex {
  const verbStems: VerbStemShape[] = [];
  const auxiliaries: AuxiliaryShape[] = [];
  const nominals = new Map<string, string[]>();

  for (const entry of entries) {
    const id = entry.id;
    const base = stripHomophoneDisambiguator(id);
    if (base.startsWith('(')) {
      const withoutDash = base.endsWith('-') ? base.slice(0, -1) : base;
      const m = withoutDash.match(/^\(([aeiuáéíú])\)(.*)$/);
      if (!m) {
        console.warn(`parseFormPure: cannot interpret auxiliary id ${JSON.stringify(id)}; skipped`);
        continue;
      }
      auxiliaries.push({ id, vowel: m[1] as SuffixVowel, fixed: m[2]!, hasDash: base.endsWith('-') });
    } else if (base.endsWith('-')) {
      verbStems.push({ id, stem: stripAccents(base.slice(0, -1)) });
    } else {
      const key = stripAccents(base);
      const list = nominals.get(key);
      if (list) list.push(id); else nominals.set(key, [id]);
    }
  }

  const nominalKeys = [...nominals.keys()].sort((a, b) => b.length - a.length);
  return { verbStems, auxiliaries, nominals, nominalKeys };
}

/**
 * All analyses of one token's romanized form. Accents in `typed` are optional.
 * The result is unordered apart from `exact` matches coming first; callers that
 * want corpus-frequency ranking should sort it themselves.
 */
export function parseForm(index: ParserIndex, typed: string): Analysis[] {
  const typedNFC = typed.normalize('NFC');
  const key = stripAccents(typedNFC);
  if (key === '') return [];

  const candidates: string[][] = [];
  enumerateVerbChains(index, key, candidates);
  enumerateNominalChains(index, key, candidates);

  const seen = new Set<string>();
  const analyses: Analysis[] = [];
  for (const entry_ids of candidates) {
    const serialized = JSON.stringify(entry_ids);
    if (seen.has(serialized)) continue;
    seen.add(serialized);
    const form = generateQuietly(entry_ids);
    if (form === null || stripAccents(form) !== key) continue;
    analyses.push({ entry_ids, form, exact: form === typedNFC });
  }
  analyses.sort((a, b) => Number(b.exact) - Number(a.exact));
  return analyses;
}

// The generator logs and warns on inputs it dislikes; while enumerating we feed
// it many such inputs on purpose, so silence it for the duration of one call.
function generateQuietly(entry_ids: string[]): string | null {
  const { warn, log } = console;
  console.warn = () => {};
  console.log = () => {};
  try {
    return conjugateAndJoinPure(entry_ids) ?? null;
  } catch {
    return null;
  } finally {
    console.warn = warn;
    console.log = log;
  }
}

// ── Verb chains: stem followed by one or more suffixes ─────────────────────

function enumerateVerbChains(index: ParserIndex, key: string, out: string[][]): void {
  for (const { id, stem } of index.verbStems) {
    if (!key.startsWith(stem)) continue;
    let stemClass: ConjugationClass;
    try { stemClass = getStemClassFromId(id); } catch { continue; }
    extendSuffixes(index, key.slice(stem.length), stemClass, [id], out, 0);
  }
}

function extendSuffixes(
  index: ParserIndex,
  rest: string,
  stemClass: ConjugationClass,
  chain: string[],
  out: string[][],
  depth: number,
): void {
  if (depth >= MAX_SUFFIX_DEPTH) return;
  for (const aux of index.auxiliaries) {
    const realized = stripAccents(SUFFIX_VOWEL[stemClass][aux.vowel] + aux.fixed);
    if (!rest.startsWith(realized)) continue;
    const remaining = rest.slice(realized.length);
    const nextChain = [...chain, aux.id];
    if (aux.hasDash) {
      // Mirrors the generator exactly: the class of the extended stem is whatever
      // `getStemClassFromId` says about the auxiliary's own id (this is what makes
      // "(á)c-" continue as c-irregular, e.g. cák- (á)c- (é)t- (i) → cakacóti).
      let nextClass: ConjugationClass;
      try { nextClass = getStemClassFromId(aux.id); } catch { continue; }
      extendSuffixes(index, remaining, nextClass, nextChain, out, depth + 1);
    } else if (remaining === '') {
      out.push(nextChain);
    }
  }
}

// ── Nominal chains: nouns, particles, suffixes, bound morphemes, phrases ───
//
// The generator joins nominal ids with a space, except that "=" swallows the
// surrounding spaces and "≡≡" collapses to "≡". Rather than re-implement that
// precisely, we enumerate loosely (allowing a space or nothing between parts,
// and a dropped leading "≡") and let generate-and-check reject the junk.

function enumerateNominalChains(index: ParserIndex, key: string, out: string[][]): void {
  extendNominals(index, key, [], out);
}

function extendNominals(index: ParserIndex, rest: string, chain: string[], out: string[][]): void {
  if (chain.length >= MAX_NOMINAL_CHAIN) return;
  const previous = chain[chain.length - 1];
  const afterBoundMorpheme = previous !== undefined && stripAccents(previous).endsWith('≡');

  const starts: string[] = [rest];
  if (chain.length > 0 && rest.startsWith(' ')) starts.push(rest.slice(1));

  for (const start of starts) {
    for (const nominalKey of index.nominalKeys) {
      let consumed: string | null = null;
      if (start.startsWith(nominalKey)) {
        consumed = nominalKey;
      } else if (afterBoundMorpheme && nominalKey.startsWith('≡') && start.startsWith(nominalKey.slice(1))) {
        consumed = nominalKey.slice(1);
      }
      if (consumed === null) continue;
      const remaining = start.slice(consumed.length);
      for (const id of index.nominals.get(nominalKey)!) {
        const nextChain = [...chain, id];
        if (remaining === '') out.push(nextChain);
        else extendNominals(index, remaining, nextChain, out);
      }
    }
  }
}

// ── Self-tests (run when this module is executed directly under Node) ──────

function hasAnalysis(analyses: Analysis[], entry_ids: string[], form: string): boolean {
  return analyses.some(a => a.form === form && a.entry_ids.length === entry_ids.length && a.entry_ids.every((id, i) => id === entry_ids[i]));
}

const TEST_ENTRIES: DictionaryEntry[] = [
  { id: 'cík-', pos: 'verb', conjugation_class: 'consonant-stem', definitions: [] },
  { id: 'éma-', pos: 'verb', conjugation_class: 'vowel-stem', definitions: [] },
  { id: 'moŕ-', pos: 'verb', conjugation_class: 'vowel-stem', definitions: [] },
  { id: 'ć-', pos: 'verb', conjugation_class: 'c-irregular', definitions: [] },
  { id: 'ná-#2', pos: 'verb', conjugation_class: 'vowel-stem', definitions: [] },
  { id: '(é)m-', pos: 'auxiliary verb', conjugation_class: 'consonant-stem', definitions: [] },
  { id: '(í)ja-', pos: 'auxiliary verb', conjugation_class: 'vowel-stem', definitions: [] },
  { id: '(u)', pos: 'verb particle', definitions: [] },
  { id: '(e)', pos: 'verb particle', definitions: [] },
  { id: '(a)', pos: 'verb particle', definitions: [] },
  { id: '(a)ta', pos: 'verb particle', definitions: [] },
  { id: 'tákan', pos: 'noun', definitions: [] },
  { id: '=cen', pos: 'noun suffix', definitions: [] },
  { id: 'ái', pos: 'noun', definitions: [] },
  { id: 'ki', pos: 'noun particle', definitions: [] },
  { id: 'a', pos: 'noun particle', definitions: [] },
  { id: 'a#2', pos: 'sentence particle', definitions: [] },
  // The parser never looks at `pos`; it classifies ids by their shape alone.
  // (`types.ts` does not yet list 'bound morpheme', so 'noun' stands in here.)
  { id: 'on≡', pos: 'noun', definitions: [] },
  { id: '≡co', pos: 'noun', definitions: [] },
];
const TEST_INDEX = buildParserIndex(TEST_ENTRIES);

console.assert(hasAnalysis(parseForm(TEST_INDEX, 'cikemu'), ['cík-', '(é)m-', '(u)'], 'cikému'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'cikému'), ['cík-', '(é)m-', '(u)'], 'cikému'));
console.assert(parseForm(TEST_INDEX, 'cikému')[0]!.exact === true);
console.assert(parseForm(TEST_INDEX, 'cikemu')[0]!.exact === false);
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'ema'), ['éma-', '(e)'], 'éma'));          // vowel-stem (e) is silent
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'emalu'), ['éma-', '(u)'], 'émalu'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'morcijalu'), ['moŕ-', '(í)ja-', '(u)'], 'morcíjalu'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'morlata'), ['moŕ-', '(a)ta'], 'moŕlata'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'cola'), ['ć-', '(a)'], 'cóla'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'nalu'), ['ná-#2', '(u)'], 'nálu'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'takan=cen'), ['tákan', '=cen'], 'tákan=cen'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'ai ki'), ['ái', 'ki'], 'ái ki'));
console.assert(hasAnalysis(parseForm(TEST_INDEX, 'on≡co'), ['on≡', '≡co'], 'ón≡co'));
console.assert(parseForm(TEST_INDEX, 'a').length === 2);                                      // a / a#2 homophones
console.assert(parseForm(TEST_INDEX, 'cikemuu').length === 0);                                // trailing junk rejected
console.assert(parseForm(TEST_INDEX, '').length === 0);

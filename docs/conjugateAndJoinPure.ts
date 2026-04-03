
// Strip the homophone disambiguator (#2, #3, …) from an id.
export function stripHomophoneDisambiguator(id: string) { return id.replace(/#\d+$/, ''); }

// Suffix vowel realisation per stem class.
// Keys are conjugation_class values; values map the parenthesised vowel to its realisation.
const SUFFIX_VOWEL = {
  'vowel-stem': { a: 'la', e: '', i: 'ci', u: 'lu', á: 'lá', é: '\u0301', í: 'cí', ú: 'lú' },
  'consonant-stem': { a: 'a', e: 'e', i: 'i', u: 'u', á: 'á', é: 'é', í: 'í', ú: 'ú' },
  'c-irregular': { a: 'ola', e: 'o', i: 'i', u: 'u', á: 'olá', é: 'ó', í: 'í', ú: 'ú' },
};

console.assert(conjugateAndJoinPure(["cán-", "(e)nít-", "(a)"]) === "caneníta");
console.assert(conjugateAndJoinPure(["móm-", "(e)cák-", "(í)ja-", "(u)"]) === "momecakíjalu");
console.assert(conjugateAndJoinPure(["éma-", "(e)"]) === "éma");
console.assert(conjugateAndJoinPure(["éma-", "(u)"]) === "émalu");

// únunu
/* 普 */console.assert(conjugateAndJoinPure(["únun-", "(e)"]) === "únune");
/* 普 */console.assert(conjugateAndJoinPure(["únun-", "(a)ta"]) === "únunata");
/* 妙 */console.assert(conjugateAndJoinPure(["únun-", "(é)m-", "(u)"]) === "unúnemu");
/* 妙 */console.assert(conjugateAndJoinPure(["únun-", "(á)c-", "(u)"]) === "unúnacu");
/* 普 */console.assert(conjugateAndJoinPure(["únun-", "(í)-", "(u)"]) === "ununílu");
/* 妙 */console.assert(conjugateAndJoinPure(["únun-", "(í)ja-", "(u)"]) === "unúnijalu");
/* 妙 */console.assert(conjugateAndJoinPure(["únun-", "(é)t-", "(u)"]) === "unúnetu");
/* 普 */console.assert(conjugateAndJoinPure(["únun-", "(e)có-", "(u)"]) === "ununecólu");
/* 妙 */console.assert(conjugateAndJoinPure(["únun-", "(é)mu-", "(u)"]) === "unúnemulu");


// moŕlu
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(e)"]) === "moŕ");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(a)ta"]) === "moŕlata");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(é)m-", "(u)"]) === "moŕmu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(á)c-", "(u)"]) === "morlácu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(í)-", "(u)"]) === "morcílu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(í)ja-", "(u)"]) === "morcíjalu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(é)t-", "(u)"]) === "moŕtu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(e)có-", "(u)"]) === "morcólu");
/* 普 */console.assert(conjugateAndJoinPure(["moŕ-", "(é)mu-", "(u)"]) === "moŕmulu");

// cú
console.assert(conjugateAndJoinPure(["ć-", "(e)"]) === "có");
console.assert(conjugateAndJoinPure(["ć-", "(a)"]) === "cóla");
console.assert(conjugateAndJoinPure(["ć-", "(u)"]) === "cú");
console.assert(conjugateAndJoinPure(["ć-", "(i)"]) === "cí");

export function getStemClassFromId(id: string): "vowel-stem" | "consonant-stem" | "c-irregular" {
  if (["ć-", "ác-", "(á)c-"].includes(id) || id.endsWith(" ć-")) {
    return "c-irregular";
  }

  const base = id.replace(/#\d+$/, '');
  if (base.endsWith('-')) {
    const stem = base.replace(/[\(\)]/g, "").slice(0, -1);
    const lastChar = stem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(-1);
    return (new Set('aeiour')).has(lastChar) ? 'vowel-stem' : 'consonant-stem';
  } else {
    throw new Error(`Invalid input ${id} passed to `);
  }
}

console.assert(conjugateAndJoinPure(["tákan", "=cen"]) === "tákan=cen");
console.assert(conjugateAndJoinPure(["ái", "ki"]) === "ái ki");

export function conjugateAndJoinPure(entry_ids: string[]) {

  const ids = entry_ids;
  if (ids[0].slice(0, 1) === "(") {
    console.warn(`The chain starts with an auxiliary; are you sure? ${JSON.stringify(entry_ids)}`)
  }
  if (ids[0].slice(-1) === "-") {
    return conjugateAndJoinVerb(entry_ids)
  }

  if (ids[0].slice(-1) === "≡") {
    return conjugateAndJoinBoundMorphemes(entry_ids);
  }

  // Otherwise it should be a noun.
  // Don't forget to strip the homophone disambiguators.
  // The entries should be delimited with spaces, but "=" removes the surrounding spaces.
  // conjugateAndJoinPure(["tákan", "=cen"]) should be "tákan=cen"
  // conjugateAndJoinPure(["ái", "ki"]) should be "ái ki"
  // conjugateAndJoinPure(["kíja#2", "ki"]) should be "kíja ki"
  // just combine all the components
  return ids.map(id => stripHomophoneDisambiguator(id)).join(" ").replaceAll(/\s?=\s?/g, "=");
}



// Accent falls on the third-from-last mora
console.assert(conjugateAndJoinBoundMorphemes(["on≡", "≡co"]) === "ón≡co");
console.assert(conjugateAndJoinBoundMorphemes(["ex≡", "≡co"]) === "éx≡co");
console.assert(conjugateAndJoinBoundMorphemes(["netumitun≡", "≡co"]) === "netumitún≡co");
console.assert(conjugateAndJoinBoundMorphemes(["iku≡", "≡co"]) === "íku≡co");
console.assert(conjugateAndJoinBoundMorphemes(["mix≡", "≡kja"]) === "míx≡kja");
console.assert(conjugateAndJoinBoundMorphemes(["on≡", "≡lesju"]) === "oń≡lesju");
console.assert(conjugateAndJoinBoundMorphemes(["ex≡", "≡lesju"]) === "ex́≡lesju");
console.assert(conjugateAndJoinBoundMorphemes(["on≡", "≡cei"]) === "oń≡cei");
// However, when "x" precedes a "p", "t", "k" or "c", such an "x" can never receive an accent, throwing it back one more mora back:
console.assert(conjugateAndJoinBoundMorphemes(["ex≡", "≡cei"]) === "éx≡cei");

function conjugateAndJoinBoundMorphemes(ids: string[]): string {
  // Step 1: Join and collapse ≡≡ → ≡
  const joined = ids.join('').replace(/≡≡/g, '≡');

  // Step 2: Strip existing acute accents (well, there should not be any...)
  const stripped = joined.normalize('NFD').replace(/\u0301/g, '').normalize('NFC');
  if (stripped !== joined) {
    console.warn(`An acute accent exists in the ids ${JSON.stringify(ids)}, but it will be stripped in conjugateAndJoinBoundMorphemes`);
  }

  // Step 3: Parse moras, tracking accent-char positions in `stripped`
  const vowels = new Set('aeiou');

  function nextPhon(pos: number): number {
    let p = pos;
    while (p < stripped.length && stripped[p] === '≡') p++;
    return p;
  }

  const moraList: Array<{ accentCharIdx: number; nextPhonIdx: number }> = [];

  let i = nextPhon(0);
  while (i < stripped.length) {
    const ch = stripped[i];
    const j1idx = nextPhon(i + 1);
    const j1 = j1idx < stripped.length ? stripped[j1idx] : '';
    const j2idx = j1idx < stripped.length ? nextPhon(j1idx + 1) : stripped.length;
    const j2 = j2idx < stripped.length ? stripped[j2idx] : '';

    if (vowels.has(ch)) {
      moraList.push({ accentCharIdx: i, nextPhonIdx: j1idx });
      i = j1idx;
    } else if (ch === 'x') {
      moraList.push({ accentCharIdx: i, nextPhonIdx: j1idx });
      i = j1idx;
    } else if (ch === 'r') {
      moraList.push({ accentCharIdx: i, nextPhonIdx: j1idx });
      i = j1idx;
    } else if (j1 === 'j' && vowels.has(j2)) {
      // CjV: accent on the vowel
      moraList.push({ accentCharIdx: j2idx, nextPhonIdx: nextPhon(j2idx + 1) });
      i = nextPhon(j2idx + 1);
    } else if (ch === 'n' && !vowels.has(j1)) {
      // syllabic n
      moraList.push({ accentCharIdx: i, nextPhonIdx: j1idx });
      i = j1idx;
    } else {
      // CV: accent on the vowel
      moraList.push({ accentCharIdx: j1idx, nextPhonIdx: nextPhon(j1idx + 1) });
      i = nextPhon(j1idx + 1);
    }
  }

  // Step 4: 3rd-from-last mora (initial if fewer than 3)
  let moraIdx = moraList.length < 3 ? 0 : moraList.length - 3;

  // Step 5: x before {p,t,k,c} cannot receive accent — throw back one mora
  const accentMora = moraList[moraIdx];
  if (stripped[accentMora.accentCharIdx] === 'x' && moraIdx > 0) {
    const nextChar = accentMora.nextPhonIdx < stripped.length ? stripped[accentMora.nextPhonIdx] : '';
    if ('ptkc'.includes(nextChar) && nextChar !== '') {
      moraIdx -= 1;
    }
  }

  // Step 6: Insert acute accent
  const accentPos = moraList[moraIdx].accentCharIdx;
  const result = stripped.slice(0, accentPos + 1) + '\u0301' + stripped.slice(accentPos + 1);
  return result.normalize('NFC');
}

function conjugateAndJoinVerb(ids: string[]) {
  if (!ids || ids.length < 2) {
    console.log({ ids });
    return null;
  }

  const suffixIds = ids.slice(1);
  if (!suffixIds.every(id => /^\([aeiuáéíú]\)/.test(id))) {
    console.warn(`What should follow a verb is a chain of suffixes; the chain is interrupted in the token ${JSON.stringify(ids)}`)
    return null;
  }

  let stem = stripHomophoneDisambiguator(ids[0]).replace(/-$/, '');

  for (let i = 1; i < ids.length; i++) {
    const previousEntry = ids[i - 1];
    let stemClass = getStemClassFromId(previousEntry);
    if (!(stemClass in SUFFIX_VOWEL)) {
      console.log({ stemClass, previousEntry })
      return null;
    }


    const suffixId = ids[i];
    const hasDash = suffixId.endsWith('-');
    const withoutDash = hasDash ? suffixId.slice(0, -1) : suffixId;
    const m = withoutDash.match(/^\(([aeiuáéíú])\)(.*)$/);
    if (!m) {
      console.log({ suffixId, withoutDash, m })
      return null;
    };
    const [, vowel, fixed] = m;

    const prefix = SUFFIX_VOWEL[stemClass][vowel as "a" | "e" | "i" | "u" | "á" | "é" | "í" | "ú"];
    const concrete = prefix + fixed;

    stem = applyAccentRule(stem + concrete);

    if (hasDash) {
      const lastChar = concrete.slice(-1);
      stemClass = (new Set('aeiour')).has(lastChar) ? 'vowel-stem' : 'consonant-stem';
    }
  }

  return stem;
}

function applyAccentRule(text: string): string {
  return text.split(" ").map(w => applyAccentRuleSingleWord(w)).join(" ");
}
function applyAccentRuleSingleWord(text: string): string {
  // Handle special cases
  if (text === "únunác") { return "unúnac"; }
  if (text === "únuném") { return "unúnem"; }
  if (text === "únunému") { return "unúnemu"; }
  if (text === "únunét") { return "unúnet"; }
  if (text === "únuníja") { return "unúnija"; }

  if (text.startsWith("ćo")) { return "có" + text.slice(2); }
  if (text.startsWith("ću")) { return "cú" + text.slice(2); }
  if (text.startsWith("ći")) { return "cí" + text.slice(2); }

  const nfd = text.normalize('NFD');
  const acute = '\u0301';
  const lastIdx = nfd.lastIndexOf(acute);
  if (lastIdx === -1) return text;
  let result = '';
  for (let i = 0; i < nfd.length; i++) {
    if (nfd[i] === acute && i !== lastIdx) continue;
    result += nfd[i];
  }
  return result.normalize('NFC');
}

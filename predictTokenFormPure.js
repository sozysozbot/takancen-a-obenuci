// Strip the homophone disambiguator (#2, #3, …) from an id.
function stripHomophoneDisambiguator(id) { return id.replace(/#\d+$/, ''); }
// Suffix vowel realisation per stem class.
// Keys are inflection_class values; values map the parenthesised vowel to its realisation.
const SUFFIX_VOWEL = {
    'vowel-stem': { a: 'la', e: '', i: 'ci', u: 'lu', á: 'lá', é: '', í: 'cí', ú: 'lú' },
    'consonant-stem': { a: 'a', e: 'e', i: 'i', u: 'u', á: 'á', é: 'e', í: 'í', ú: 'ú' },
    'c-irregular': { a: 'ola', e: 'o', i: 'i', u: 'u', á: 'olá', é: 'o', í: 'í', ú: 'ú' },
};
console.assert(predictTokenFormPure(["únun-", "(e)"]) === "únune");
console.assert(predictTokenFormPure(["cán-", "(e)nít-", "(a)"]) === "caneníta");
console.assert(predictTokenFormPure(["móm-", "(e)cák-", "(í)ja-", "(u)"]) === "momecakíjalu");
console.assert(predictTokenFormPure(["éma-", "(e)"]) === "éma");
console.assert(predictTokenFormPure(["éma-", "(u)"]) === "émalu");
console.assert(predictTokenFormPure(["moŕ-", "(a)ta"]) === "moŕlata");
export function getStemClassFromId(id) {
    if (["c-", "ác-", "(á)c-"].includes(id)) {
        return "c-irregular";
    }
    const base = id.replace(/#\d+$/, '');
    if (base.endsWith('-')) {
        const stem = base.replace(/[\(\)]/g, "").slice(0, -1);
        const lastChar = stem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(-1);
        return (new Set('aeiour')).has(lastChar) ? 'vowel-stem' : 'consonant-stem';
    }
    else {
        throw new Error(`Invalid input ${id} passed to `);
    }
}
export function predictTokenFormPure(entry_ids) {
    const ids = entry_ids;
    if (ids[0].slice(0, 1) === "(") {
        console.warn(`The chain starts with an auxiliary; are you sure? ${JSON.stringify(entry_ids)}`);
    }
    if (ids[0].slice(-1) === "-") {
        return predictTokenFormVerb(entry_ids);
    }
    // otherwise it should be a noun; just combine all the components
    // but don't forget to strip the homophone disambiguators
    return ids.map(stripHomophoneDisambiguator).join("");
}
function predictTokenFormVerb(ids) {
    if (!ids || ids.length < 2) {
        console.log({ ids });
        return null;
    }
    const suffixIds = ids.slice(1);
    if (!suffixIds.every(id => /^\([aeiuáéíú]\)/.test(id))) {
        console.warn(`What should follow a verb is a chain of suffixes; the chain is interrupted in the token ${JSON.stringify(ids)}`);
        return null;
    }
    let stem = stripHomophoneDisambiguator(ids[0]).replace(/-$/, '');
    for (let i = 1; i < ids.length; i++) {
        const previousEntry = ids[i - 1];
        let stemClass = getStemClassFromId(previousEntry);
        if (!(stemClass in SUFFIX_VOWEL)) {
            console.log({ stemClass, previousEntry });
            return null;
        }
        const suffixId = ids[i];
        const hasDash = suffixId.endsWith('-');
        const withoutDash = hasDash ? suffixId.slice(0, -1) : suffixId;
        const m = withoutDash.match(/^\(([aeiuáéíú])\)(.*)$/);
        if (!m) {
            console.log({ suffixId, withoutDash, m });
            return null;
        }
        ;
        const [, vowel, fixed] = m;
        const prefix = SUFFIX_VOWEL[stemClass][vowel];
        const concrete = prefix + fixed;
        stem = applyAccentRule(stem + concrete);
        if (hasDash) {
            const lastChar = concrete.slice(-1);
            stemClass = (new Set('aeiour')).has(lastChar) ? 'vowel-stem' : 'consonant-stem';
        }
    }
    return stem;
}
function applyAccentRule(text) {
    const nfd = text.normalize('NFD');
    const acute = '\u0301';
    const lastIdx = nfd.lastIndexOf(acute);
    if (lastIdx === -1)
        return text;
    let result = '';
    for (let i = 0; i < nfd.length; i++) {
        if (nfd[i] === acute && i !== lastIdx)
            continue;
        result += nfd[i];
    }
    return result.normalize('NFC');
}

// ── Romanization → hiragana ────────────────────────────────────────────────
// Transcription conventions: c = サ行, s = ザ行, j = ヤ行, l = ラ行

export const CV_TABLE: Record<string, string> = {
  'a':'あ','i':'い','u':'う','e':'え','o':'お',
  'ka':'か','ki':'き','ku':'く','ke':'け','ko':'こ',
  'ga':'が','gi':'ぎ','gu':'ぐ','ge':'げ','go':'ご',
  'ca':'さ','ci':'し','cu':'す','ce':'せ','co':'そ',  // c = サ行
  'sa':'ざ','si':'じ','su':'ず','se':'ぜ','so':'ぞ',  // s = ザ行
  'ta':'た','ti':'ち','tu':'つ','te':'て','to':'と',
  'da':'だ','di':'ぢ','du':'づ','de':'で','do':'ど',
  'na':'な','ni':'に','nu':'ぬ','ne':'ね','no':'の',
  'ba':'ば','bi':'び','bu':'ぶ','be':'べ','bo':'ぼ',
  'pa':'ぱ','pi':'ぴ','pu':'ぷ','pe':'ぺ','po':'ぽ',
  'ma':'ま','mi':'み','mu':'む','me':'め','mo':'も',
  'ja':'や','ju':'ゆ', 'jo':'よ',  // j = ヤ行
  'la':'ら','li':'り','lu':'る','le':'れ','lo':'ろ',  // l = ラ行
  'wa':'わ','wi':'ゐ','we':'ゑ','wo':'を',
};
export const VOWELS = new Set('aeiou');

// Small vowel kana for 拗音 (contracted sounds): CjV → Ci-kana + small-V-kana
// e.g. kja → きぁ, kju → きぅ, kjo → きぉ (distinct from Japanese kya/kyu/kyo)
const SMALL_VOWEL: Record<string, string> = {
  'a': 'ぁ', 'i': 'ぃ', 'u': 'ぅ', 'e': 'ぇ', 'o': 'ぉ',
};

export function latinToSyllabary(token: string): string {
  // Strip accent marks (acute etc.) then morpheme-boundary markers
  let text = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  text = text.replace(/[-=]/g, '').toLowerCase();

  // or → ou
  text = text.replace(/or/g, "ou");

  text = text.replace(/r/g, "ー");

  let result = '';
  let i = 0;
  while (i < text.length) {
    // Try CjV (3-char contracted sound) before anything else
    // e.g. kja → きぁ, nja → にぁ (must precede syllabic-n rule)
    const ciKana = text[i + 1] === 'j' ? CV_TABLE[text[i] + 'i'] : undefined;
    const smallV = ciKana ? SMALL_VOWEL[text[i + 2] ?? ''] : undefined;
    if (ciKana && smallV) { result += ciKana + smallV; i += 3; continue; }
    // Try CV pair
    const cv2 = text[i] + (text[i + 1] ?? '');
    if (CV_TABLE[cv2]) { result += CV_TABLE[cv2]; i += 2; continue; }
    // Syllabic n: 'n' not followed by a vowel
    if (text[i] === 'n' && !VOWELS.has(text[i + 1]!)) { result += 'ん'; i++; continue; }
    // Bare vowel
    if (VOWELS.has(text[i]!) && CV_TABLE[text[i]!]) { result += CV_TABLE[text[i]!]; i++; continue; }
    // Geminate consonant: 'x' → っ
    if (text[i] === 'x') { result += 'っ'; i++; continue; }
    // Unknown — pass through so nothing silently disappears
    result += text[i]; i++;
  }
  return result;
}

function hasAcuteAccent(word: string): boolean {
  return word.normalize('NFD').includes('\u0301');
}

/**
 * Converts an array of Takan-cen romanized words into a spaced hiragana string.
 *
 * Spacing rule: a word that carries an acute accent (á, é, í, ó, ú) begins a
 * new space-separated group; a word with no acute accent is concatenated
 * directly to the preceding group without a space.
 *
 * This reflects the prosodic structure of Takan-cen, where unaccented
 * grammatical words (particles, certain suffixes) are phonologically bound to
 * the preceding accented content word.
 */
export function toSpacedHiraganaPure(words: string[]): string {
  const groups: string[] = [];
  for (const word of words) {
    const hiragana = latinToSyllabary(word);
    if (groups.length === 0 || hasAcuteAccent(word)) {
      groups.push(hiragana);
    } else {
      groups[groups.length - 1] += hiragana;
    }
  }
  return groups.join(' ');
}

console.assert(toSpacedHiraganaPure("kákan ja céjo jamámuta".split(" ")) === "かかんや せよ やまむた");
console.assert(toSpacedHiraganaPure("mórwa jameníte wáca ja nóni".split(" ")) === "もうわ やめにて わさや のに");
console.assert(toSpacedHiraganaPure("nó ja nimálane=cen ki cemalácu".split(" ")) === "のや にまらねせんき せまらす");
console.assert(toSpacedHiraganaPure("láneme ja kjábetu wáci".split(" ")) === "らねめや きぁべつ わし");
console.assert(toSpacedHiraganaPure("kéca ju káxcen wácata a".split(" ")) === "けさゆ かっせん わさたあ");
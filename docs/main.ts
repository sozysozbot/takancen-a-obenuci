import { conjugateAndJoinPure, getStemClassFromId, stripHomophoneDisambiguator } from "./conjugateAndJoinPure.js";
import { toSpacedHiraganaPure, latinToSyllabary } from "./toSpacedHiraganaPure.js";
import type { DictionaryEntry, CorpusSentence, DictionaryData, CorpusData, I18nData, LocalizedString, Pos, ConjugationClass } from './types.js';

let dictionary: DictionaryEntry[] = [];
let corpus: CorpusSentence[] = [];
const entryMap = new Map<string, DictionaryEntry>();
// Maps each entry id to the sibling ids in its alternative-form group (excluding itself).
const alternativesMap = new Map<string, string[]>();
let i18n: I18nData = {};
let lang = 'en';
let entryFilter = '';

const SUPPORTED_LANGS = ['en', 'ja'];

function detectLang(): string {
  const param = new URLSearchParams(location.search).get('lang');
  if (param && SUPPORTED_LANGS.includes(param)) return param;
  const browserLang = (navigator.language || 'en').split('-')[0]!;
  return SUPPORTED_LANGS.includes(browserLang) ? browserLang : 'en';
}

function t(section: 'pos' | 'conj' | 'ui', key: string): string {
  return i18n[section]?.[key] ?? key;
}

function localize(s: LocalizedString): string {
  if (lang === 'ja') return s.ja;
  return s.en ?? s.ja;
}

function tCount(count: number, property_name: 'count-in-corpus' | 'count-word'): string {
  const tmpl = count === 1 && i18n[property_name]?.one
    ? i18n[property_name].one
    : (i18n[property_name]?.other ?? `${count} sentence${count !== 1 ? 's' : ''} in corpus`);
  return tmpl.replace('${COUNT}', String(count));
}

async function init() {
  lang = detectLang();
  const [dictData, corpusData, i18nData] = await Promise.all([
    fetch('data/dictionary.json', { cache: 'no-store' }).then(r => r.json() as Promise<DictionaryData>),
    fetch('data/corpus.json', { cache: 'no-store' }).then(r => r.json() as Promise<CorpusData>),
    fetch(`data/i18n-${lang}.json`, { cache: 'no-store' }).then(r => r.json() as Promise<I18nData>),
  ]);
  i18n = i18nData;

  dictionary = dictData.entries;
  corpus = corpusData.sentences.map((s, i) => ({ ...s, id: String(i) }));
  for (const entry of dictionary) entryMap.set(entry.id, entry);
  for (const group of dictData.alternative_form_groups ?? []) {
    for (const id of group.entry_ids) {
      alternativesMap.set(id, group.entry_ids.filter(other => other !== id));
    }
  }

  setupControls();
  setupSettings();
  setupModal();
  renderDictionary(dictionary);
  renderMissingHighFreq(computeHighFreqMissing());

  const initialSource = new URLSearchParams(location.search).get('source') ?? '';
  (document.getElementById('source-filter') as HTMLSelectElement).value = initialSource;
  entryFilter = new URLSearchParams(location.search).get('entry') ?? '';
  updateEntryFilterUI();
  applyAllFilters();

  const initialTab = new URLSearchParams(location.search).get('tab');
  if (initialTab === 'dictionary' || initialTab === 'corpus') switchTab(initialTab);
}

// ── Settings (language + font toggle) ─────────────────────────────────────

function setupSettings() {
  // Highlight the active language button
  document.getElementById('lang-en')!.classList.toggle('active', lang === 'en');
  document.getElementById('lang-ja')!.classList.toggle('active', lang === 'ja');

  document.getElementById('lang-en')!.addEventListener('click', () => switchLang('en'));
  document.getElementById('lang-ja')!.addEventListener('click', () => switchLang('ja'));

  // Font toggle — persisted in localStorage
  const fontEnabled = localStorage.getItem('scriptFont') !== 'off';
  applyScriptFont(fontEnabled);
  document.getElementById('font-toggle')!.addEventListener('click', () => {
    const next = document.body.classList.contains('no-script-font');
    applyScriptFont(next);
    localStorage.setItem('scriptFont', next ? 'on' : 'off');
  });
}

function switchLang(lang: string) {
  const params = new URLSearchParams(location.search);
  params.set('lang', lang);
  location.search = params.toString(); // triggers reload
}

function applyScriptFont(enabled: boolean) {
  document.body.classList.toggle('no-script-font', !enabled);
  document.getElementById('font-toggle')!.classList.toggle('active', enabled);
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(name: 'dictionary' | 'corpus') {
  document.getElementById('panel-dictionary')!.hidden = name !== 'dictionary';
  document.getElementById('panel-corpus')!.hidden = name !== 'corpus';
  document.getElementById('tab-dictionary')!.classList.toggle('active', name === 'dictionary');
  document.getElementById('tab-corpus')!.classList.toggle('active', name === 'corpus');
  const params = new URLSearchParams(location.search);
  params.set('tab', name);
  history.replaceState(null, '', '?' + params.toString());
}

// ── Controls setup ─────────────────────────────────────────────────────────

function setupControls() {
  document.getElementById('tab-dictionary')!.addEventListener('click', () => switchTab('dictionary'));
  document.getElementById('tab-corpus')!.addEventListener('click', () => switchTab('corpus'));
  document.getElementById('search-input')!.addEventListener('input', applyFilter);
  document.getElementById('pos-filter')!.addEventListener('change', applyFilter);
  document.getElementById('source-filter')!.addEventListener('change', applyAllFilters);
  document.getElementById('entry-filter-clear')!.addEventListener('click', () => {
    entryFilter = '';
    updateEntryFilterUI();
    applyAllFilters();
  });

  document.getElementById('tab-dictionary')!.textContent = t('ui', 'Dictionary');
  document.getElementById('tab-corpus')!.textContent = t('ui', 'Corpus');
  (document.getElementById('search-input') as HTMLInputElement).placeholder = t('ui', 'Search\u2026');

  const enlistedHeading = document.createElement('div');
  enlistedHeading.className = 'entry-list-heading';
  enlistedHeading.textContent = `${t('ui', 'Enlisted words')}: ${tCount(dictionary.length, 'count-word')}`;
  document.getElementById('entry-list')!.before(enlistedHeading);

  // Create the "All parts of speech" option first
  const sel = document.getElementById('pos-filter') as HTMLSelectElement;
  const allOpt = document.createElement('option');
  allOpt.value = "";
  allOpt.textContent = t('pos', "All parts of speech");
  sel.appendChild(allOpt);

  // Populate POS filter from data
  const poses = [...new Set(dictionary.map(e => e.pos))].sort();
  for (const pos of poses) {
    const opt = document.createElement('option');
    opt.value = pos;
    opt.textContent = t('pos', pos);
    sel.appendChild(opt);
  }

  // Populate source filter for corpus
  const sourceSel = document.getElementById('source-filter') as HTMLSelectElement;
  const allSourceOpt = document.createElement('option');
  allSourceOpt.value = '';
  allSourceOpt.textContent = t('ui', 'All sources');
  sourceSel.appendChild(allSourceOpt);
  const sources = [...new Set(corpus.flatMap(s => s.source ? [s.source] : []))].sort();
  for (const source of sources) {
    const opt = document.createElement('option');
    opt.value = source;
    opt.textContent = source;
    sourceSel.appendChild(opt);
  }
}

function applyFilter() {
  const query = (document.getElementById('search-input') as HTMLInputElement).value.trim().toLowerCase();
  const pos = (document.getElementById('pos-filter') as HTMLSelectElement).value;

  const filtered = dictionary.filter(entry => {
    const matchQuery = !query
      || entry.id.toLowerCase().includes(query)
      || entry.definitions.some(d =>
        d.gloss.toLowerCase().includes(query) ||
        (d.translations ? localize(d.translations) : '').toLowerCase().includes(query));
    const matchPos = !pos || entry.pos === pos;
    return matchQuery && matchPos;
  });

  renderDictionary(filtered);
}

function updateEntryFilterUI() {
  const banner = document.getElementById('entry-filter-banner')!;
  const label = document.getElementById('entry-filter-label')!;
  banner.hidden = !entryFilter;
  label.textContent = '';
  if (entryFilter) {
    label.appendChild(document.createTextNode(t('ui', 'entry filter') + ' '));
    const badge = document.createElement('span');
    badge.className = 'entry-link found';
    badge.textContent = entryFilter;
    badge.addEventListener('click', () => navigateToEntry(entryFilter));
    label.appendChild(badge);
  }
}

function applyAllFilters() {
  const source = (document.getElementById('source-filter') as HTMLSelectElement).value;
  const params = new URLSearchParams(location.search);
  if (source) params.set('source', source); else params.delete('source');
  if (entryFilter) params.set('entry', entryFilter); else params.delete('entry');
  history.replaceState(null, '', '?' + params.toString());

  let filtered = corpus;
  if (source) filtered = filtered.filter(s => s.source === source);
  if (entryFilter) filtered = filtered.filter(s => s.tokens.some(tok =>
    'punctuation' in tok ? false
    : 'multiple-standard-pronunciations' in tok
      ? tok.entry_ids_of_each_form.some(ids => ids.includes(entryFilter))
      : tok.entry_ids?.includes(entryFilter)
  ));
  renderCorpus(filtered);
}

// ── Frequent missing words ─────────────────────────────────────────────────

function computeHighFreqMissing(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sentence of corpus) {
    const seenInSentence = new Set<string>();
    for (const token of sentence.tokens) {
      const ids = 'punctuation' in token
        ? []
        : 'multiple-standard-pronunciations' in token
          ? token.entry_ids_of_each_form.flat()
          : (token.entry_ids ?? []);
      for (const id of ids) {
        if (!entryMap.has(id) && !seenInSentence.has(id)) {
          seenInSentence.add(id);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
  }
  const result = new Map<string, number>();
  for (const [id, count] of counts) {
    if (count >= 4) result.set(id, count);
  }
  return result;
}

function renderMissingHighFreq(entries: Map<string, number>) {
  const list = document.getElementById('missing-list')!;
  list.innerHTML = '';
  if (entries.size === 0) return;

  const heading = document.createElement('div');
  heading.className = 'missing-section-heading';
  heading.textContent = t('ui', 'Frequent undocumented words');
  list.appendChild(heading);

  for (const [id, count] of [...entries].sort((a, b) => b[1] - a[1])) {
    const div = document.createElement('div');
    div.className = 'entry missing-frequent';
    div.addEventListener('click', () => openEntryModal(id));

    const header = document.createElement('div');
    header.className = 'entry-header';

    const lemma = document.createElement('span');
    lemma.className = 'lemma';
    lemma.textContent = id;
    header.appendChild(lemma);

    const countBadge = document.createElement('span');
    countBadge.className = 'pos';
    countBadge.textContent = tCount(count, 'count-in-corpus');
    header.appendChild(countBadge);

    div.appendChild(header);
    list.appendChild(div);
  }
}

const PUNCTUATION_MAPPING = {
  "。": ".",
  "？":"?",
  ":": ":", // both are ASCII
  "(" : "(", // both are ASCII
  ")" : ")", // both are ASCII
  "「" : "“",
  "」":"”",
  '│': "\t|\t",
  "！":"!"
};

// ── Dictionary rendering ───────────────────────────────────────────────────

// Normalised sort key: strip accents and punctuation chars (-, =, ≡) but keep
// parentheses, then lowercase — used for the default alphabetical sort order.
function entrySortKey(id: string): string {
  return id.replace(/#\d+$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-=≡]/g, '')
    .toLowerCase();
}

function renderDictionary(entries: DictionaryEntry[]) {
  const list = document.getElementById('entry-list')!;
  list.innerHTML = '';
  const sorted = [...entries].sort((a, b) =>
    entrySortKey(a.id).localeCompare(entrySortKey(b.id))
  );
  for (const entry of sorted) list.appendChild(buildEntryEl(entry));
}

// Unicode superscript digits for homophone numbering in headers.
const SUPERS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function superscript(n: string): string { return n.split('').map(d => SUPERS[+d]).join(''); }

function getLemma(entry: DictionaryEntry): string {
  const base = stripHomophoneDisambiguator(entry.id);
  if (entry.pos === "verb" || entry.pos === "auxiliary verb") {
    if (base.slice(-1) === "-") {
      if (entry.conjugation_class === "consonant-stem" || entry.conjugation_class === "c-irregular") {
        if (base.endsWith("ć-")) {
          return base.slice(0, -2) + "cú";
        } else {
          return base.slice(0, -1) + "u";
        }
      } else if (entry.conjugation_class === "vowel-stem") {
        return base.slice(0, -1) + "lu";
      } else {
        console.warn(`warning: entry ${entry.id} ends in a hyphen but its conjugation class is ${entry.conjugation_class}`);
      }
    } else {
      console.warn(`warning: entry ${entry.id} is a verb/aux but does not end in a hyphen`);
    }
  }
  return base;
}

function buildEntryEl(entry: DictionaryEntry): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'entry';
  div.dataset['id'] = entry.id;

  // Header: lemma, optional script form, POS badge
  const header = document.createElement('div');
  header.className = 'entry-header';

  const lemma = document.createElement('span');
  lemma.className = 'lemma';
  const headword = getLemma(entry);
  const stemPart = stripHomophoneDisambiguator(entry.id);
  const homNum = entry.id.match(/#(\d+)$/);
  const sup = homNum ? superscript(homNum[1]!) : '';
  lemma.appendChild(document.createTextNode(`${headword}${sup}`));
  if (headword !== stemPart) {
    const stemLabel = document.createElement('span');
    stemLabel.className = 'lemma-stem';
    stemLabel.textContent = ` [${stemPart}]`;
    lemma.appendChild(stemLabel);
  }
  header.appendChild(lemma);

  if (entry.script?.length) {
    for (let i = 0; i < entry.script.length; i++) {
      if (i > 0) header.appendChild(document.createTextNode(' / '));
      header.appendChild(
        buildScriptElWithRuby({ mixed_script: entry.script[i]!, latin_form: headword })
      );
    }
  }

  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = t('pos', entry.pos);
  header.appendChild(pos);

  div.appendChild(header);

  if (entry.pos === "verb" || entry.pos === "auxiliary verb") {
    const ic = document.createElement('div');
    ic.className = 'conjugation-class';
    ic.textContent = t('conj', entry.conjugation_class);
    div.appendChild(ic);
  }

  // Definitions
  const defs = document.createElement('ol');
  defs.className = 'definitions';
  for (const def of entry.definitions) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = def.gloss;
    li.appendChild(strong);
    if (def.translations) {
      const text = lang === 'ja' ? def.translations.ja : def.translations.en;
      if (text) li.append(' — ' + text);
    }
    defs.appendChild(li);
  }
  div.appendChild(defs);

  if (entry.notes) {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.textContent = localize(entry.notes);
    div.appendChild(notes);
  }

  // Component words (cross-links within the dictionary)
  if (entry.components?.length) {
    const compRow = document.createElement('div');
    compRow.className = 'entry-components';
    const label = document.createElement('span');
    label.className = 'components-label';
    label.textContent = t('ui', 'components') + ':';
    compRow.appendChild(label);
    for (const id of entry.components) {
      const badge = document.createElement('span');
      if (entryMap.has(id)) {
        badge.className = 'entry-link found';
        badge.textContent = id;
        badge.addEventListener('click', () => navigateToEntry(id));
      } else {
        badge.className = 'entry-link missing';
        badge.textContent = id;
      }
      compRow.appendChild(badge);
    }
    div.appendChild(compRow);
  }

  // Alternative forms
  const alternatives = alternativesMap.get(entry.id);
  if (alternatives?.length) {
    const altRow = document.createElement('div');
    altRow.className = 'entry-components';
    const label = document.createElement('span');
    label.className = 'components-label';
    label.textContent = t('ui', 'alternative forms') + ':';
    altRow.appendChild(label);
    for (const id of alternatives) {
      const badge = document.createElement('span');
      if (entryMap.has(id)) {
        badge.className = 'entry-link found';
        badge.textContent = id;
        badge.addEventListener('click', () => navigateToEntry(id));
      } else {
        badge.className = 'entry-link missing';
        badge.textContent = id;
      }
      altRow.appendChild(badge);
    }
    div.appendChild(altRow);
  }

  // Link to corpus sentences that use this entry
  const linked = corpus.filter(s => s.tokens.some(t =>
    'punctuation' in t
      ? false
      : 'multiple-standard-pronunciations' in t
        ? t.entry_ids_of_each_form.some(ids => ids.includes(entry.id))
        : t.entry_ids?.includes(entry.id)
  ));
  if (linked.length > 0) {
    const link = document.createElement('div');
    link.className = 'corpus-link';
    link.textContent = tCount(linked.length, 'count-in-corpus');
    link.addEventListener('click', () => {
      entryFilter = entry.id;
      updateEntryFilterUI();
      switchTab('corpus');
      applyAllFilters();
    });
    div.appendChild(link);
  }

  return div;
}

// ── Corpus rendering ───────────────────────────────────────────────────────

function renderCorpus(sentences: CorpusSentence[]) {
  const list = document.getElementById('corpus-list')!;
  list.innerHTML = '';
  for (const sentence of sentences) list.appendChild(buildSentenceEl(sentence));
}

function buildSentenceEl(sentence: CorpusSentence): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'sentence';
  div.dataset['id'] = sentence.id;

  if (sentence.source) {
    const src = document.createElement('div');
    src.className = 'source';
    src.textContent = sentence.source;
    div.appendChild(src);
  }

  // Interlinear gloss block
  const interlinear = document.createElement('div');
  interlinear.className = 'interlinear';
  for (const token of sentence.tokens) interlinear.appendChild(buildTokenEl(token));
  div.appendChild(interlinear);

  // Free translation
  const translation = document.createElement('div');
  translation.className = 'translation';
  translation.textContent = '\u201C' + localize(sentence.translation) + '\u201D';
  div.appendChild(translation);

  // Copy buttons
  const copyRow = document.createElement('div');
  copyRow.className = 'sentence-copy-row';
  const copyScript = document.createElement('button');
  copyScript.type = 'button';
  copyScript.textContent = t('ui', 'Copy script');
  copyScript.addEventListener('click', () => {
    const text = sentence.tokens.map(tok =>
      'punctuation' in tok ? tok.punctuation : (tok.mixed_script ?? '')
    ).join('');
    navigator.clipboard.writeText(text).then(() => {
      copyScript.textContent = t('ui', 'Copied!');
      setTimeout(() => { copyScript.textContent = t('ui', 'Copy script'); }, 1500);
    });
  });
  const copyHiragana = document.createElement('button');
  copyHiragana.type = 'button';
  copyHiragana.textContent = t('ui', 'Copy Hiragana');
  copyHiragana.addEventListener('click', () => {
    let hiragana = '';
    let batch: string[] = [];
    for (const tok of sentence.tokens) {
      if ('punctuation' in tok) {
        if (batch.length > 0) { hiragana += toSpacedHiraganaPure(batch); batch = []; }
        hiragana += tok.punctuation;
      } else if ('multiple-standard-pronunciations' in tok) {
        batch.push('{' + tok.forms.join('/') + '}');
      } else {
        batch.push(tok.form);
      }
    }
    if (batch.length > 0) hiragana += toSpacedHiraganaPure(batch);
    navigator.clipboard.writeText(hiragana).then(() => {
      copyHiragana.textContent = t('ui', 'Copied!');
      setTimeout(() => { copyHiragana.textContent = t('ui', 'Copy Hiragana'); }, 1500);
    });
  });
  const copyLatin = document.createElement('button');
  copyLatin.type = 'button';
  copyLatin.textContent = t('ui', 'Copy latin');
  copyLatin.addEventListener('click', () => {
    let latin = '';
    let needSpace = false;
    for (const tok of sentence.tokens) {
      if ('punctuation' in tok) {
        const isOpening = tok.punctuation === '(' || tok.punctuation === '「';
        if (isOpening && needSpace) latin += ' ';
        latin += PUNCTUATION_MAPPING[tok.punctuation] ?? tok.punctuation;
        needSpace = !isOpening;
      } else {
        if (needSpace) latin += ' ';
        latin += 'multiple-standard-pronunciations' in tok ? tok.forms.join('/') : tok.form;
        needSpace = true;
      }
    }
    navigator.clipboard.writeText(latin).then(() => {
      copyLatin.textContent = t('ui', 'Copied!');
      setTimeout(() => { copyLatin.textContent = t('ui', 'Copy latin'); }, 1500);
    });
  });
  copyRow.append(copyScript, copyHiragana, copyLatin);
  div.appendChild(copyRow);

  return div;
}

function buildScriptElWithRuby(o: { mixed_script: string, latin_form: string }): HTMLElement {
  const mixedText = o.mixed_script || '';
  const syllText = latinToSyllabary(o.latin_form);
  const coincide = !mixedText || mixedText === syllText;

  const scriptEl = document.createElement('ruby');
  scriptEl.className = 'token-script';
  scriptEl.appendChild(document.createTextNode(mixedText || syllText));

  const rt = document.createElement('rt');
  rt.textContent = coincide ? "\u3000" : syllText;
  scriptEl.appendChild(rt);

  return scriptEl;
}

function buildEntryLinks(ids: string[]): HTMLDivElement {
  const links = document.createElement('div');
  links.className = 'entry-links';
  for (const id of ids) {
    const badge = document.createElement('span');
    if (entryMap.has(id)) {
      badge.className = 'entry-link found';
      badge.addEventListener('click', () => navigateToEntry(id));
    } else {
      badge.className = 'entry-link missing';
      badge.addEventListener('click', () => openEntryModal(id));
    }
    badge.textContent = id;
    links.appendChild(badge);
  }
  return links;
}

function buildTokenEl(token: import('./types.js').Token): HTMLDivElement {
  const div = document.createElement('div');

  if ('punctuation' in token) {
    div.className = 'token';
    div.appendChild(buildScriptElWithRuby({ mixed_script: token.punctuation, latin_form: token.punctuation }));
    const form = document.createElement('div');
    form.className = 'token-form';
    form.textContent = PUNCTUATION_MAPPING[token.punctuation] ?? token.punctuation;
    div.appendChild(form);
    const gloss = document.createElement('div');
    gloss.className = 'token-gloss';
    gloss.textContent = '';
    div.appendChild(gloss);
    return div;
  }

  if ('multiple-standard-pronunciations' in token) {
    div.className = 'token';
    div.appendChild(buildScriptElWithRuby({ mixed_script: token.mixed_script || '', latin_form: token.forms.join(' / ') }));

    const form = document.createElement('div');
    form.className = 'token-form';
    form.textContent = token.forms.join(' / ');
    div.appendChild(form);

    const links = document.createElement('div');
    links.className = 'entry-links';
    for (let i = 0; i < token.entry_ids_of_each_form.length; i++) {
      if (i > 0) links.appendChild(document.createTextNode(' / '));
      for (const id of token.entry_ids_of_each_form[i]!) {
        const badge = document.createElement('span');
        if (entryMap.has(id)) {
          badge.className = 'entry-link found';
          badge.addEventListener('click', () => navigateToEntry(id));
        } else {
          badge.className = 'entry-link missing';
          badge.addEventListener('click', () => openEntryModal(id));
        }
        badge.textContent = id;
        links.appendChild(badge);
      }
    }
    if (links.childNodes.length) div.appendChild(links);

    const gloss = document.createElement('div');
    gloss.className = 'token-gloss';
    gloss.textContent = token.gloss;
    div.appendChild(gloss);

    return div;
  }

  const predicted = token.entry_ids ? conjugateAndJoinPure(token.entry_ids) : null;
  const actual = token.form.replace(/[-=]/g, '').normalize('NFC');
  const mismatch = predicted !== null && predicted !== actual;
  if (mismatch) {
    div.className = 'token mismatch';
    div.title = `expected "${predicted}" but was given "${actual}"`;
    console.warn(`expected "${predicted}" but was given ${actual}`);
  } else {
    div.className = 'token';
  }

  div.appendChild(buildScriptElWithRuby({ mixed_script: token.mixed_script || '', latin_form: token.form }));

  const form = document.createElement('div');
  form.className = 'token-form';
  form.textContent = token.form;
  div.appendChild(form);

  if (token.entry_ids?.length) div.appendChild(buildEntryLinks(token.entry_ids));

  const gloss = document.createElement('div');
  gloss.className = 'token-gloss';
  gloss.textContent = token.gloss ?? '';
  div.appendChild(gloss);

  return div;
}

// ── Cross-linking ──────────────────────────────────────────────────────────

function navigateToEntry(id: string) {
  (document.getElementById('search-input') as HTMLInputElement).value = '';
  (document.getElementById('pos-filter') as HTMLSelectElement).value = '';
  renderDictionary(dictionary);
  switchTab('dictionary');
  highlightEntry(id);
}

function highlightEntry(id: string) {
  for (const el of document.querySelectorAll('.entry')) el.classList.remove('highlighted');
  const el = document.querySelector<HTMLElement>(`.entry[data-id="${id}"]`);
  if (el) {
    el.classList.add('highlighted');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Entry modal ────────────────────────────────────────────────────────────

const modal = document.getElementById('entry-modal') as HTMLDialogElement;
const fieldLemma = document.getElementById('field-lemma') as HTMLInputElement;
const scriptList = document.getElementById('script-list') as HTMLDivElement;
const fieldPos = document.getElementById('field-pos') as HTMLSelectElement;
const fieldInflect = document.getElementById('field-conjugation') as HTMLSelectElement;
const fieldNotes = document.getElementById('field-notes') as HTMLInputElement;
const defList = document.getElementById('def-list') as HTMLDivElement;
const jsonOutput = document.getElementById('json-output') as HTMLTextAreaElement;

let modalEntryId = '';

function openEntryModal(id: string) {
  modalEntryId = id;
  document.getElementById('modal-title')!.textContent = t('ui', 'New entry:') + ' ' + id;
  fieldLemma.value = id;

  // Auto-select POS: strip #N disambiguator, then check id shape
  const base = id.replace(/#\d+$/, '');
  if (base.endsWith('-')) {
    fieldPos.value = base.startsWith('(') ? 'auxiliary verb' : 'verb';
    fieldInflect.value = getStemClassFromId(id);
  } else {
    fieldPos.value = 'noun';
  }

  scriptList.innerHTML = '';
  addScriptRow();
  fieldNotes.value = '';
  defList.innerHTML = '';
  addDefRow();
  syncInflectVisibility();
  updateJsonOutput();
  modal.showModal();
}

function canInflect(): boolean {
  return fieldPos.value === 'verb' || fieldPos.value === 'auxiliary verb';
}

function syncInflectVisibility() {
  fieldInflect.disabled = !canInflect();
}

function addScriptRow() {
  const row = document.createElement('div');
  row.className = 'script-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'script-input';
  inp.addEventListener('input', updateJsonOutput);
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.textContent = '✕';
  rm.addEventListener('click', () => { row.remove(); updateJsonOutput(); });
  row.append(inp, rm);
  scriptList.appendChild(row);
  inp.focus();
}

function addDefRow() {
  const row = document.createElement('div');
  row.className = 'def-row';

  const gloss = document.createElement('input');
  gloss.type = 'text';
  gloss.placeholder = t('ui', 'gloss');
  gloss.className = 'def-gloss';
  gloss.addEventListener('input', updateJsonOutput);

  const def = document.createElement('input');
  def.type = 'text';
  def.placeholder = t('ui', 'definition');
  def.className = 'def-definition';
  def.addEventListener('input', updateJsonOutput);

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.textContent = '✕';
  rm.addEventListener('click', () => { row.remove(); updateJsonOutput(); });

  row.append(gloss, def, rm);
  defList.appendChild(row);
  gloss.focus();
}

function buildEntryObject() {
  const scripts = [...scriptList.querySelectorAll<HTMLInputElement>('.script-input')]
    .map(el => el.value.trim()).filter(s => s.length > 0);
  const entry: Record<string, unknown> = {
    id: modalEntryId,
    script: scripts,
    pos: fieldPos.value,
  };
  if (canInflect()) {
    entry['conjugation_class'] = fieldInflect.value;
  }
  const defs: { gloss: string; translations?: { ja: string } }[] = [];
  for (const row of defList.querySelectorAll<HTMLDivElement>('.def-row')) {
    const g = (row.querySelector('.def-gloss') as HTMLInputElement).value.trim();
    const d = (row.querySelector('.def-definition') as HTMLInputElement).value.trim();
    if (g || d) defs.push({ gloss: g, ...(d ? { translations: { ja: d } } : {}) });
  }
  entry['definitions'] = defs;
  const notes = fieldNotes.value.trim();
  if (notes) entry['notes'] = { ja: notes };
  return entry;
}

function updateJsonOutput() {
  jsonOutput.value = JSON.stringify(buildEntryObject(), null, 2);
}

// Setup modal event listeners (called once after DOM is ready)
function setupModal() {
  document.getElementById('modal-close')!.addEventListener('click', () => modal.close());
  document.getElementById('add-script-btn')!.addEventListener('click', addScriptRow);
  document.getElementById('add-def-btn')!.addEventListener('click', addDefRow);
  document.getElementById('copy-json-btn')!.addEventListener('click', () => {
    navigator.clipboard.writeText(jsonOutput.value);
  });

  fieldLemma.addEventListener('input', updateJsonOutput);
  fieldNotes.addEventListener('input', updateJsonOutput);
  fieldInflect.addEventListener('change', updateJsonOutput);
  fieldPos.addEventListener('change', () => { syncInflectVisibility(); updateJsonOutput(); });

  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

  // Set localized label text
  document.getElementById('modal-label-lemma')!.textContent = t('ui', 'Lemma');
  document.getElementById('modal-label-script')!.textContent = t('ui', 'Script');
  document.getElementById('add-script-btn')!.textContent = t('ui', '+ Add script');
  document.getElementById('modal-label-pos')!.textContent = t('ui', 'POS');
  document.getElementById('modal-label-conj')!.textContent = t('ui', 'conjugation class');
  document.getElementById('modal-label-definitions')!.textContent = t('ui', 'Definitions');
  document.getElementById('add-def-btn')!.textContent = t('ui', '+ Add definition');
  document.getElementById('modal-label-notes')!.textContent = t('ui', 'Notes');
  document.getElementById('modal-label-optional')!.textContent = t('ui', '(optional)');
  document.getElementById('modal-label-json-output')!.textContent = t('ui', 'JSON output');
  document.getElementById('copy-json-btn')!.textContent = t('ui', 'Copy');

  // Populate POS select
  const poses: Pos[] = ['noun', 'noun suffix', 'noun particle', 'verb particle', 'sentence particle', 'verb', 'auxiliary verb'];
  for (const p of poses) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = t('pos', p);
    fieldPos.appendChild(opt);
  }

  // Populate conjugation class select
  const conjClasses: ConjugationClass[] = ['vowel-stem', 'consonant-stem', 'c-irregular'];
  for (const c of conjClasses) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = t('conj', c);
    fieldInflect.appendChild(opt);
  }
}

init();

import { predictTokenFormPure, getStemClassFromId, stripHomophoneDisambiguator } from "./predictTokenFormPure.js";
// ── Romanization → hiragana ────────────────────────────────────────────────
// Transcription conventions: c = サ行, s = ザ行, j = ヤ行, l = ラ行
const CV_TABLE = {
    'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',
    'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
    'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
    'ca': 'さ', 'ci': 'し', 'cu': 'す', 'ce': 'せ', 'co': 'そ', // c = サ行
    'sa': 'ざ', 'si': 'じ', 'su': 'ず', 'se': 'ぜ', 'so': 'ぞ', // s = ザ行
    'ta': 'た', 'ti': 'ち', 'tu': 'つ', 'te': 'て', 'to': 'と',
    'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',
    'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
    'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
    'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
    'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
    'ja': 'や', 'ju': 'ゆ', 'jo': 'よ', // j = ヤ行
    'la': 'ら', 'li': 'り', 'lu': 'る', 'le': 'れ', 'lo': 'ろ', // l = ラ行
    'wa': 'わ', 'wi': 'ゐ', 'we': 'ゑ', 'wo': 'を',
};
const VOWELS = new Set('aeiou');
function latinToSyllabary(token) {
    // Strip accent marks (acute etc.) then morpheme-boundary markers
    let text = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    text = text.replace(/[-=]/g, '').toLowerCase();
    // or → ou
    text = text.replace(/or/g, "ou");
    text = text.replace(/r/g, "ー");
    let result = '';
    let i = 0;
    while (i < text.length) {
        // Try CV pair first
        const cv2 = text[i] + (text[i + 1] ?? '');
        if (CV_TABLE[cv2]) {
            result += CV_TABLE[cv2];
            i += 2;
            continue;
        }
        // Syllabic n: 'n' not followed by a vowel
        if (text[i] === 'n' && !VOWELS.has(text[i + 1])) {
            result += 'ん';
            i++;
            continue;
        }
        // Bare vowel
        if (VOWELS.has(text[i]) && CV_TABLE[text[i]]) {
            result += CV_TABLE[text[i]];
            i++;
            continue;
        }
        // Unknown — pass through so nothing silently disappears
        result += text[i];
        i++;
    }
    return result;
}
let dictionary = [];
let corpus = [];
const entryMap = new Map();
let i18n = {};
let lang = 'en';
const SUPPORTED_LANGS = ['en', 'ja'];
function detectLang() {
    const param = new URLSearchParams(location.search).get('lang');
    if (param && SUPPORTED_LANGS.includes(param))
        return param;
    const browserLang = (navigator.language || 'en').split('-')[0];
    return SUPPORTED_LANGS.includes(browserLang) ? browserLang : 'en';
}
function t(section, key) {
    return i18n[section]?.[key] ?? key;
}
function localize(s) {
    return (lang === 'ja' ? s.ja : undefined) ?? s.en;
}
function tCount(count) {
    const tmpl = count === 1 && i18n['count-in-corpus']?.one
        ? i18n['count-in-corpus'].one
        : (i18n['count-in-corpus']?.other ?? `${count} sentence${count !== 1 ? 's' : ''} in corpus`);
    return tmpl.replace('${COUNT}', String(count));
}
async function init() {
    lang = detectLang();
    const [dictData, corpusData, i18nData] = await Promise.all([
        fetch('data/dictionary.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('data/corpus.json', { cache: 'no-store' }).then(r => r.json()),
        fetch(`data/i18n-${lang}.json`, { cache: 'no-store' }).then(r => r.json()),
    ]);
    i18n = i18nData;
    dictionary = dictData.entries;
    corpus = corpusData.sentences;
    for (const entry of dictionary)
        entryMap.set(entry.id, entry);
    setupControls();
    setupSettings();
    setupModal();
    renderDictionary(dictionary);
    renderCorpus(corpus);
    const initialTab = new URLSearchParams(location.search).get('tab');
    if (initialTab === 'dictionary' || initialTab === 'corpus')
        switchTab(initialTab);
}
// ── Settings (language + font toggle) ─────────────────────────────────────
function setupSettings() {
    // Highlight the active language button
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    document.getElementById('lang-ja').classList.toggle('active', lang === 'ja');
    document.getElementById('lang-en').addEventListener('click', () => switchLang('en'));
    document.getElementById('lang-ja').addEventListener('click', () => switchLang('ja'));
    // Font toggle — persisted in localStorage
    const fontEnabled = localStorage.getItem('scriptFont') !== 'off';
    applyScriptFont(fontEnabled);
    document.getElementById('font-toggle').addEventListener('click', () => {
        const next = document.body.classList.contains('no-script-font');
        applyScriptFont(next);
        localStorage.setItem('scriptFont', next ? 'on' : 'off');
    });
}
function switchLang(lang) {
    const params = new URLSearchParams(location.search);
    params.set('lang', lang);
    location.search = params.toString(); // triggers reload
}
function applyScriptFont(enabled) {
    document.body.classList.toggle('no-script-font', !enabled);
    document.getElementById('font-toggle').classList.toggle('active', enabled);
}
// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name) {
    document.getElementById('panel-dictionary').hidden = name !== 'dictionary';
    document.getElementById('panel-corpus').hidden = name !== 'corpus';
    document.getElementById('tab-dictionary').classList.toggle('active', name === 'dictionary');
    document.getElementById('tab-corpus').classList.toggle('active', name === 'corpus');
    const params = new URLSearchParams(location.search);
    params.set('tab', name);
    history.replaceState(null, '', '?' + params.toString());
}
// ── Controls setup ─────────────────────────────────────────────────────────
function setupControls() {
    document.getElementById('tab-dictionary').addEventListener('click', () => switchTab('dictionary'));
    document.getElementById('tab-corpus').addEventListener('click', () => switchTab('corpus'));
    document.getElementById('search-input').addEventListener('input', applyFilter);
    document.getElementById('pos-filter').addEventListener('change', applyFilter);
    // Create the "All parts of speech" option first
    const sel = document.getElementById('pos-filter');
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
}
function applyFilter() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const pos = document.getElementById('pos-filter').value;
    const filtered = dictionary.filter(entry => {
        const matchQuery = !query
            || entry.id.toLowerCase().includes(query)
            || entry.definitions.some(d => localize(d.gloss).toLowerCase().includes(query) ||
                (d.definition ? localize(d.definition) : '').toLowerCase().includes(query));
        const matchPos = !pos || entry.pos === pos;
        return matchQuery && matchPos;
    });
    renderDictionary(filtered);
}
// ── Dictionary rendering ───────────────────────────────────────────────────
function renderDictionary(entries) {
    const list = document.getElementById('entry-list');
    list.innerHTML = '';
    for (const entry of entries)
        list.appendChild(buildEntryEl(entry));
}
// Unicode superscript digits for homophone numbering in headers.
const SUPERS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function superscript(n) { return n.split('').map(d => SUPERS[+d]).join(''); }
function getLemma(entry) {
    const base = stripHomophoneDisambiguator(entry.id);
    if (entry.pos === "verb" || entry.pos === "auxiliary verb") {
        if (base.slice(-1) === "-") {
            if (entry.conjugation_class === "consonant-stem" || entry.conjugation_class === "c-irregular") {
                return base.slice(0, -1) + "u";
            }
            else if (entry.conjugation_class === "vowel-stem") {
                return base.slice(0, -1) + "lu";
            }
            else {
                console.warn(`warning: entry ${entry.id} ends in a hyphen but its conjugation class is ${entry.conjugation_class}`);
            }
        }
        else {
            console.warn(`warning: entry ${entry.id} is a verb/aux but does not end in a hyphen`);
        }
    }
    return base;
}
function buildEntryEl(entry) {
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
    const sup = homNum ? superscript(homNum[1]) : '';
    lemma.appendChild(document.createTextNode(`${headword}${sup}`));
    if (headword !== stemPart) {
        const stemLabel = document.createElement('span');
        stemLabel.className = 'lemma-stem';
        stemLabel.textContent = ` [${stemPart}]`;
        lemma.appendChild(stemLabel);
    }
    header.appendChild(lemma);
    if (entry.script) {
        header.appendChild(buildScriptElWithRuby({ mixed_script: entry.script, latin_form: headword }));
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
        strong.textContent = localize(def.gloss);
        li.appendChild(strong);
        if (def.definition) {
            li.append(' — ' + localize(def.definition));
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
            }
            else {
                badge.className = 'entry-link missing';
                badge.textContent = id;
            }
            compRow.appendChild(badge);
        }
        div.appendChild(compRow);
    }
    // Link to corpus sentences that use this entry
    const linked = corpus.filter(s => s.tokens.some(t => t.entry_ids?.includes(entry.id)));
    if (linked.length > 0) {
        const link = document.createElement('div');
        link.className = 'corpus-link';
        link.textContent = tCount(linked.length);
        link.addEventListener('click', () => {
            switchTab('corpus');
            highlightSentences(linked.map(s => s.id));
        });
        div.appendChild(link);
    }
    return div;
}
// ── Corpus rendering ───────────────────────────────────────────────────────
function renderCorpus(sentences) {
    const list = document.getElementById('corpus-list');
    list.innerHTML = '';
    for (const sentence of sentences)
        list.appendChild(buildSentenceEl(sentence));
}
function buildSentenceEl(sentence) {
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
    for (const token of sentence.tokens)
        interlinear.appendChild(buildTokenEl(token));
    div.appendChild(interlinear);
    // Free translation
    const translation = document.createElement('div');
    translation.className = 'translation';
    translation.textContent = '\u201C' + localize(sentence.translation) + '\u201D';
    div.appendChild(translation);
    return div;
}
function buildScriptElWithRuby(o) {
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
function buildTokenEl(token) {
    const div = document.createElement('div');
    const predicted = token.entry_ids ? predictTokenFormPure(token.entry_ids) : null;
    const actual = token.form.replace(/[-=]/g, '').normalize('NFC');
    const mismatch = predicted !== null && predicted !== actual;
    if (mismatch) {
        div.className = 'token mismatch';
        console.warn(`expected "${predicted}" but was given ${actual}`);
    }
    else {
        div.className = 'token';
    }
    div.appendChild(buildScriptElWithRuby({ mixed_script: token.mixed_script || '', latin_form: token.form }));
    const form = document.createElement('div');
    form.className = 'token-form';
    form.textContent = token.form;
    div.appendChild(form);
    // One clickable badge per entry_id; red if missing from dictionary
    if (token.entry_ids?.length) {
        const links = document.createElement('div');
        links.className = 'entry-links';
        for (const id of token.entry_ids) {
            const badge = document.createElement('span');
            if (entryMap.has(id)) {
                badge.className = 'entry-link found';
                badge.addEventListener('click', () => navigateToEntry(id));
            }
            else {
                badge.className = 'entry-link missing';
                badge.addEventListener('click', () => openEntryModal(id));
            }
            badge.textContent = id;
            links.appendChild(badge);
        }
        div.appendChild(links);
    }
    const gloss = document.createElement('div');
    gloss.className = 'token-gloss';
    gloss.textContent = token.gloss ?? '';
    div.appendChild(gloss);
    return div;
}
// ── Cross-linking ──────────────────────────────────────────────────────────
function highlightSentences(ids) {
    const idSet = new Set(ids);
    let first = true;
    for (const el of document.querySelectorAll('.sentence')) {
        const matches = idSet.has(el.dataset['id']);
        el.classList.toggle('highlighted', matches);
        if (matches && first) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            first = false;
        }
    }
}
function navigateToEntry(id) {
    document.getElementById('search-input').value = '';
    document.getElementById('pos-filter').value = '';
    renderDictionary(dictionary);
    switchTab('dictionary');
    highlightEntry(id);
}
function highlightEntry(id) {
    for (const el of document.querySelectorAll('.entry'))
        el.classList.remove('highlighted');
    const el = document.querySelector(`.entry[data-id="${id}"]`);
    if (el) {
        el.classList.add('highlighted');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
// ── Entry modal ────────────────────────────────────────────────────────────
const modal = document.getElementById('entry-modal');
const fieldLemma = document.getElementById('field-lemma');
const fieldPos = document.getElementById('field-pos');
const fieldInflect = document.getElementById('field-conjugation');
const fieldNotes = document.getElementById('field-notes');
const defList = document.getElementById('def-list');
const jsonOutput = document.getElementById('json-output');
let modalEntryId = '';
function openEntryModal(id) {
    modalEntryId = id;
    document.getElementById('modal-title').textContent = 'New entry: ' + id;
    fieldLemma.value = id;
    // Auto-select POS: strip #N disambiguator, then check id shape
    const base = id.replace(/#\d+$/, '');
    if (base.endsWith('-')) {
        fieldPos.value = base.startsWith('(') ? 'auxiliary verb' : 'verb';
        fieldInflect.value = getStemClassFromId(id);
    }
    else {
        fieldPos.value = 'noun';
    }
    fieldNotes.value = '';
    defList.innerHTML = '';
    addDefRow();
    syncInflectVisibility();
    updateJsonOutput();
    modal.showModal();
}
function canInflect() {
    return fieldPos.value === 'verb' || fieldPos.value === 'auxiliary verb';
}
function syncInflectVisibility() {
    fieldInflect.disabled = !canInflect();
}
function addDefRow() {
    const row = document.createElement('div');
    row.className = 'def-row';
    const gloss = document.createElement('input');
    gloss.type = 'text';
    gloss.placeholder = 'gloss';
    gloss.className = 'def-gloss';
    gloss.addEventListener('input', updateJsonOutput);
    const def = document.createElement('input');
    def.type = 'text';
    def.placeholder = 'definition';
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
    const entry = {
        id: modalEntryId,
        script: '',
        pos: fieldPos.value,
    };
    if (canInflect()) {
        entry['conjugation_class'] = fieldInflect.value;
    }
    const defs = [];
    for (const row of defList.querySelectorAll('.def-row')) {
        const g = row.querySelector('.def-gloss').value.trim();
        const d = row.querySelector('.def-definition').value.trim();
        if (g || d)
            defs.push({ gloss: { en: g }, ...(d ? { definition: { en: d } } : {}) });
    }
    entry['definitions'] = defs;
    const notes = fieldNotes.value.trim();
    if (notes)
        entry['notes'] = { en: notes };
    return entry;
}
function updateJsonOutput() {
    jsonOutput.value = JSON.stringify(buildEntryObject(), null, 2);
}
// Setup modal event listeners (called once after DOM is ready)
function setupModal() {
    document.getElementById('modal-close').addEventListener('click', () => modal.close());
    document.getElementById('add-def-btn').addEventListener('click', addDefRow);
    document.getElementById('copy-json-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(jsonOutput.value);
    });
    fieldLemma.addEventListener('input', updateJsonOutput);
    fieldNotes.addEventListener('input', updateJsonOutput);
    fieldInflect.addEventListener('change', updateJsonOutput);
    fieldPos.addEventListener('change', () => { syncInflectVisibility(); updateJsonOutput(); });
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal)
        modal.close(); });
}
init();

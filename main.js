// ── Romanization → hiragana ────────────────────────────────────────────────
// Transcription conventions: c = サ行, s = ザ行, j = ヤ行, l = ラ行

const CV_TABLE = {
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
    if (CV_TABLE[cv2]) { result += CV_TABLE[cv2]; i += 2; continue; }
    // Syllabic n: 'n' not followed by a vowel
    if (text[i] === 'n' && !VOWELS.has(text[i + 1])) { result += 'ん'; i++; continue; }
    // Bare vowel
    if (VOWELS.has(text[i]) && CV_TABLE[text[i]]) { result += CV_TABLE[text[i]]; i++; continue; }
    // Unknown — pass through so nothing silently disappears
    result += text[i]; i++;
  }
  return result;
}

let dictionary = [];
let corpus = [];
const entryMap = new Map(); // id -> entry

async function init() {
  const [dictData, corpusData] = await Promise.all([
    fetch('data/dictionary.json').then(r => r.json()),
    fetch('data/corpus.json').then(r => r.json()),
  ]);

  dictionary = dictData.entries;
  corpus = corpusData.sentences;
  for (const entry of dictionary) entryMap.set(entry.id, entry);

  setupControls();
  setupModal();
  renderDictionary(dictionary);
  renderCorpus(corpus);
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(name) {
  document.getElementById('panel-dictionary').hidden = name !== 'dictionary';
  document.getElementById('panel-corpus').hidden    = name !== 'corpus';
  document.getElementById('tab-dictionary').classList.toggle('active', name === 'dictionary');
  document.getElementById('tab-corpus').classList.toggle('active',     name === 'corpus');
}

// ── Controls setup ─────────────────────────────────────────────────────────

function setupControls() {
  document.getElementById('tab-dictionary').addEventListener('click', () => switchTab('dictionary'));
  document.getElementById('tab-corpus').addEventListener('click',     () => switchTab('corpus'));
  document.getElementById('search-input').addEventListener('input',   applyFilter);
  document.getElementById('pos-filter').addEventListener('change',    applyFilter);

  // Populate POS filter from data
  const poses = [...new Set(dictionary.map(e => e.pos))].sort();
  const sel = document.getElementById('pos-filter');
  for (const pos of poses) {
    const opt = document.createElement('option');
    opt.value = pos;
    opt.textContent = pos;
    sel.appendChild(opt);
  }
}

function applyFilter() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const pos   = document.getElementById('pos-filter').value;

  const filtered = dictionary.filter(entry => {
    const matchQuery = !query
      || entry.lemma.toLowerCase().includes(query)
      || entry.definitions.some(d =>
           d.gloss.toLowerCase().includes(query) ||
           d.definition.toLowerCase().includes(query));
    const matchPos = !pos || entry.pos === pos;
    return matchQuery && matchPos;
  });

  renderDictionary(filtered);
}

// ── Dictionary rendering ───────────────────────────────────────────────────

function renderDictionary(entries) {
  const list = document.getElementById('entry-list');
  list.innerHTML = '';
  for (const entry of entries) list.appendChild(buildEntryEl(entry));
}

function buildEntryEl(entry) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.dataset.id = entry.id;

  // Header: lemma, optional script form, POS badge
  const header = document.createElement('div');
  header.className = 'entry-header';

  const lemma = document.createElement('span');
  lemma.className = 'lemma';
  lemma.textContent = entry.lemma;
  header.appendChild(lemma);

  if (entry.script) {
    const script = document.createElement('span');
    script.className = 'script';
    script.textContent = entry.script;
    header.appendChild(script);
  }

  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = entry.pos;
  header.appendChild(pos);

  div.appendChild(header);

  if (entry.inflection_class) {
    const ic = document.createElement('div');
    ic.className = 'inflection-class';
    ic.textContent = entry.inflection_class;
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
    li.append(' — ' + def.definition);
    defs.appendChild(li);
  }
  div.appendChild(defs);

  if (entry.notes) {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.textContent = entry.notes;
    div.appendChild(notes);
  }

  // Link to corpus sentences that use this entry
  const linked = corpus.filter(s => s.tokens.some(t => t.entry_ids?.includes(entry.id)));
  if (linked.length > 0) {
    const link = document.createElement('div');
    link.className = 'corpus-link';
    link.textContent = `${linked.length} sentence${linked.length > 1 ? 's' : ''} in corpus`;
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
  for (const sentence of sentences) list.appendChild(buildSentenceEl(sentence));
}

function buildSentenceEl(sentence) {
  const div = document.createElement('div');
  div.className = 'sentence';
  div.dataset.id = sentence.id;

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
  translation.textContent = '\u201C' + sentence.translation + '\u201D';
  div.appendChild(translation);

  return div;
}

// ── Morphophonological form prediction ────────────────────────────────────────
// Validates that a token's form is consistent with its entry_ids.
// Rules: vowel-stem: (a)→la, (e)→"", (i)→ci, (u)→lu
//        consonant-stem: (V)→V  (use the vowel directly)
//        accent: rightmost acute wins, all others deleted

function applyAccentRule(text) {
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

const VOWEL_STEM_MAP = { a: 'la', e: '', i: 'ci', u: 'lu' };

function predictTokenForm(token) {
  const ids = token.entry_ids;
  if (!ids || ids.length < 2) return null;

  const verbEntry = entryMap.get(ids[0]);
  if (!verbEntry || verbEntry.pos !== 'verb') return null;

  let stemClass = verbEntry.inflection_class;
  if (stemClass !== 'vowel-stem' && stemClass !== 'consonant-stem') return null;

  const suffixIds = ids.slice(1);
  if (!suffixIds.every(id => /^\([aeiou]\)/.test(id))) return null;

  let stem = verbEntry.lemma.replace(/-$/, '');

  for (const suffixId of suffixIds) {
    const hasDash = suffixId.endsWith('-');
    const withoutDash = hasDash ? suffixId.slice(0, -1) : suffixId;
    const m = withoutDash.match(/^\(([aeiou])\)(.*)$/);
    if (!m) return null;
    const [, vowel, fixed] = m;

    const prefix = stemClass === 'consonant-stem' ? vowel : VOWEL_STEM_MAP[vowel];
    const concrete = prefix + fixed;

    stem = applyAccentRule(stem + concrete);

    if (hasDash) {
      const lastChar = concrete.slice(-1);
      stemClass = VOWELS.has(lastChar) ? 'vowel-stem' : 'consonant-stem';
    }
  }

  return stem;
}

function buildTokenEl(token) {
  const div = document.createElement('div');

  const predicted = predictTokenForm(token);
  const actual    = token.form.replace(/[-=]/g, '').normalize('NFC');
  const mismatch  = predicted !== null && predicted !== actual;
  div.className = mismatch ? 'token mismatch' : 'token';

  const mixedText = token.mixed_script || '';
  const syllText  = latinToSyllabary(token.form);
  const coincide  = !mixedText || mixedText === syllText;

  const scriptEl = document.createElement('ruby');
  scriptEl.className = 'token-script';
  scriptEl.appendChild(document.createTextNode(mixedText || syllText));

  const rt = document.createElement('rt');
  rt.textContent = coincide ? "\u3000" : syllText;
  scriptEl.appendChild(rt);
  
  div.appendChild(scriptEl);

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
        badge.addEventListener('click', () => {
          switchTab('dictionary');
          highlightEntry(id);
        });
      } else {
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
  gloss.textContent = token.gloss;
  div.appendChild(gloss);

  return div;
}

// ── Cross-linking ──────────────────────────────────────────────────────────

function highlightSentences(ids) {
  const idSet = new Set(ids);
  let first = true;
  for (const el of document.querySelectorAll('.sentence')) {
    const matches = idSet.has(el.dataset.id);
    el.classList.toggle('highlighted', matches);
    if (matches && first) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      first = false;
    }
  }
}

function highlightEntry(id) {
  for (const el of document.querySelectorAll('.entry')) el.classList.remove('highlighted');
  const el = document.querySelector(`.entry[data-id="${id}"]`);
  if (el) {
    el.classList.add('highlighted');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Entry modal ────────────────────────────────────────────────────────────

const modal          = document.getElementById('entry-modal');
const fieldLemma     = document.getElementById('field-lemma');
const fieldPos       = document.getElementById('field-pos');
const fieldInflect   = document.getElementById('field-inflection');
const inflectLabel   = document.getElementById('inflection-label');
const fieldNotes     = document.getElementById('field-notes');
const defList        = document.getElementById('def-list');
const jsonOutput     = document.getElementById('json-output');

let modalEntryId = '';

function openEntryModal(id) {
  modalEntryId = id;
  document.getElementById('modal-title').textContent = 'New entry: ' + id;
  fieldLemma.value = id;
  fieldPos.value   = 'noun';
  fieldNotes.value = '';
  defList.innerHTML = '';
  addDefRow();
  syncInflectVisibility();
  updateJsonOutput();
  modal.showModal();
}

function syncInflectVisibility() {
  inflectLabel.hidden = fieldPos.value !== 'verb';
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
    id:    modalEntryId,
    lemma: fieldLemma.value.trim(),
    script: '',
    pos:   fieldPos.value,
  };
  if (fieldPos.value === 'verb') {
    entry.inflection_class = fieldInflect.value;
  }
  const defs = [];
  for (const row of defList.querySelectorAll('.def-row')) {
    const g = row.querySelector('.def-gloss').value.trim();
    const d = row.querySelector('.def-definition').value.trim();
    if (g || d) defs.push({ gloss: g, definition: d });
  }
  entry.definitions = defs;
  const notes = fieldNotes.value.trim();
  if (notes) entry.notes = notes;
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
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
}

init();

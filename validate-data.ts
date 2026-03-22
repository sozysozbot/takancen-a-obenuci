import { z } from 'zod';
import { readFileSync } from 'fs';

// ── Schemas ────────────────────────────────────────────────────────────────

const localizedStringSchema = z.object({
  en: z.string().optional(),
  ja: z.string(),
});

const definitionSchema = z.object({
  gloss: z.string(),
  translations: localizedStringSchema.optional(),
});

const commonFields = {
  id: z.string(),
  script: z.array(z.string()).optional(),
  definitions: z.array(definitionSchema),
  notes: localizedStringSchema.optional(),
  components: z.array(z.string()).optional(),
};

const conjugationClassSchema = z.enum(['vowel-stem', 'consonant-stem', 'c-irregular']);

// Declinable entries (verb / auxiliary verb) require conjugation_class.
// Indeclinable entries must NOT have conjugation_class (z.undefined() rejects
// any non-undefined value, including the empty string "").
const entrySchema = z.union([
  z.object({
    ...commonFields,
    pos: z.enum(['verb', 'auxiliary verb']),
    conjugation_class: conjugationClassSchema,
  }),
  z.object({
    ...commonFields,
    pos: z.enum(['noun', 'noun suffix', 'noun particle', 'verb particle', 'sentence particle', 'phrase', 'bound morpheme', 'prenominal', 'noun conjunction','sentence conjunction','adjectival noun','interjection']),
    conjugation_class: z.undefined(),
  }),
]);

const alternativeFormGroupSchema = z.object({
  script: z.string().optional(),
  entry_ids: z.array(z.string()).min(2),
});

const dictionaryDataSchema = z.object({
  entries: z.array(entrySchema),
  alternative_form_groups: z.array(alternativeFormGroupSchema).optional(),
});

const singleFormTokenSchema = z.object({
  form: z.string(),
  mixed_script: z.string().optional(),
  entry_ids: z.array(z.string()).optional(),
  gloss: z.string().optional(),
});

const multiPronunciationTokenSchema = z.object({
  'multiple-standard-pronunciations': z.literal(true),
  forms: z.array(z.string()),
  mixed_script: z.string().optional(),
  gloss: z.string(),
  entry_ids_of_each_form: z.array(z.array(z.string())),
});

const punctuationTokenSchema = z.object({
  punctuation: z.enum(['。', '(', ')', '「', '」', '！', ':', '？', '│']),
});

const tokenSchema = z.union([singleFormTokenSchema, multiPronunciationTokenSchema, punctuationTokenSchema]);

const corpusDataSchema = z.object({
  sentences: z.array(z.object({
    source: z.string().optional(),
    tokens: z.array(tokenSchema),
    translation: localizedStringSchema,
  })),
});

// ── Validate ───────────────────────────────────────────────────────────────

let hasError = false;

function validate(label: string, schema: z.ZodSchema, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success) {
    console.log(`✅  ${label}`);
  } else {
    console.error(`❌  ${label}`);
    for (const issue of result.error.issues) {
      console.error(`    [${issue.path.join('.')}] ${issue.message}`);
    }
    hasError = true;
  }
}

const dictionaryRaw = JSON.parse(readFileSync('docs/data/dictionary.json', 'utf-8'));
const corpusRaw = JSON.parse(readFileSync('docs/data/corpus.json', 'utf-8'));

validate('dictionary.json', dictionaryDataSchema, dictionaryRaw);
validate('corpus.json',     corpusDataSchema,     corpusRaw);

if (!hasError) {
  const corpusData = corpusDataSchema.parse(corpusRaw);
  const dictionaryData = dictionaryDataSchema.parse(dictionaryRaw);
  const entryMap = new Map(dictionaryData.entries.map(e => [e.id, e]));

  let lengthError = false;
  for (const [si, sentence] of corpusData.sentences.entries()) {
    for (const [ti, token] of sentence.tokens.entries()) {
      if ('punctuation' in token || 'multiple-standard-pronunciations' in token) continue;
      if (!token.gloss || !token.entry_ids) continue;
      const parts = token.gloss.split('-');
      if (parts.length !== token.entry_ids.length) {
        console.error(`❌  corpus.json cross-validation: sentences[${si}].tokens[${ti}]: gloss.split("-").length (${parts.length}) ≠ entry_ids.length (${token.entry_ids.length})`);
        hasError = true;
        lengthError = true;
      }
    }
  }
  if (!lengthError) console.log('✅  cross-validation');

  let glossError = false;
  for (const [si, sentence] of corpusData.sentences.entries()) {
    for (const [ti, token] of sentence.tokens.entries()) {
      if ('punctuation' in token || 'multiple-standard-pronunciations' in token) continue;
      if (!token.gloss || !token.entry_ids) continue;
      const parts = token.gloss.split('-');
      if (parts.length !== token.entry_ids.length) continue; // already reported above
      for (let mi = 0; mi < parts.length; mi++) {
        const entryId = token.entry_ids[mi]!;
        const entry = entryMap.get(entryId);
        if (!entry) continue; // missing from dictionary — flagged by red badges, not here
        const corpusGloss = parts[mi]!.replace(/\./g, ' ');
        if (!entry.definitions.some(d => d.gloss === corpusGloss)) {
          console.error(`❌  gloss mismatch: sentences[${si}].tokens[${ti}] morpheme ${mi} (${entryId}): corpus says ${JSON.stringify(corpusGloss)}, dictionary has [${entry.definitions.map(d => JSON.stringify(d.gloss)).join(', ')}]`);
          hasError = true;
          glossError = true;
        }
      }
    }
  }
  if (!glossError) console.log('✅  gloss consistency');
}

if (hasError) process.exit(1);

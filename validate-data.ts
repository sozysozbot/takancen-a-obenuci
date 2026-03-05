import { z } from 'zod';
import { readFileSync } from 'fs';

// ── Schemas ────────────────────────────────────────────────────────────────

const definitionSchema = z.object({
  gloss: z.string(),
  definition: z.string().optional(),
});

const commonFields = {
  id: z.string(),
  script: z.string().optional(),
  definitions: z.array(definitionSchema),
  notes: z.string().optional(),
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
    pos: z.enum(['noun', 'noun suffix', 'noun particle', 'verb particle', 'sentence particle']),
    conjugation_class: z.undefined(),
  }),
]);

const dictionaryDataSchema = z.object({
  entries: z.array(entrySchema),
});

const tokenSchema = z.object({
  form: z.string(),
  mixed_script: z.string().optional(),
  entry_ids: z.array(z.string()).optional(),
  gloss: z.string().optional(),
});

const corpusDataSchema = z.object({
  sentences: z.array(z.object({
    id: z.string(),
    source: z.string().optional(),
    tokens: z.array(tokenSchema),
    translation: z.string(),
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

validate('dictionary.json', dictionaryDataSchema, JSON.parse(readFileSync('data/dictionary.json', 'utf-8')));
validate('corpus.json',     corpusDataSchema,     JSON.parse(readFileSync('data/corpus.json',     'utf-8')));

if (hasError) process.exit(1);

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
        pos: z.enum(['noun', 'noun suffix', 'noun particle', 'verb particle', 'sentence particle']),
        conjugation_class: z.undefined(),
    }),
]);
const dictionaryDataSchema = z.object({
    entries: z.array(entrySchema),
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
    punctuation: z.enum(['。', '(', ')', '「', '」', '！', ':']),
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
function validate(label, schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        console.log(`✅  ${label}`);
    }
    else {
        console.error(`❌  ${label}`);
        for (const issue of result.error.issues) {
            console.error(`    [${issue.path.join('.')}] ${issue.message}`);
        }
        hasError = true;
    }
}
validate('dictionary.json', dictionaryDataSchema, JSON.parse(readFileSync('data/dictionary.json', 'utf-8')));
validate('corpus.json', corpusDataSchema, JSON.parse(readFileSync('data/corpus.json', 'utf-8')));
if (hasError)
    process.exit(1);

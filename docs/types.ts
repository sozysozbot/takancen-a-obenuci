export type Pos = DeclinablePos | IndeclinablePos;
type DeclinablePos = 'verb' | 'auxiliary verb';
type IndeclinablePos = 'noun' | 'noun suffix'  | 'noun particle'
  | 'verb particle'
  | 'sentence particle';

export type ConjugationClass = 'vowel-stem' | 'consonant-stem' | 'c-irregular';

export interface LocalizedString {
  en?: string;
  ja: string;
}

export interface Definition {
  gloss: string;
  translations?: LocalizedString;
}

export type DictionaryEntry = {
  id: string;
  script?: string[];
  pos: DeclinablePos;
  conjugation_class: ConjugationClass;
  definitions: Definition[];
  notes?: LocalizedString;
  components?: string[];
} | {
  id: string;
  script?: string[];
  pos: IndeclinablePos;
  definitions: Definition[];
  notes?: LocalizedString;
  components?: string[];
}

export interface AlternativeFormGroup {
  script?: string;
  entry_ids: string[];
}

export interface DictionaryData {
  entries: DictionaryEntry[];
  alternative_form_groups?: AlternativeFormGroup[];
}

export interface SingleFormToken {
  form: string;
  mixed_script?: string;
  entry_ids?: string[];
  gloss?: string;
}

export interface MultiPronunciationToken {
  'multiple-standard-pronunciations': true;
  forms: string[];
  mixed_script?: string;
  gloss: string;
  entry_ids_of_each_form: string[][];
}

export type PunctuationMark = '。' | '(' | ')' | '「' | '」' | '！';

export interface PunctuationToken {
  punctuation: PunctuationMark;
}

export type Token = SingleFormToken | MultiPronunciationToken | PunctuationToken;

export interface CorpusSentenceData {
  source?: string;
  tokens: Token[];
  translation: LocalizedString;
}

export interface CorpusSentence extends CorpusSentenceData {
  id: string;
}

export interface CorpusData {
  sentences: CorpusSentenceData[];
}

export interface I18nData {
  pos?: Partial<Record<string, string>>;
  conj?: Partial<Record<string, string>>;
  'count-in-corpus'?: { one?: string; other?: string };
  ui?: Partial<Record<string, string>>;
}

export type Pos = DeclinablePos | IndeclinablePos;
type DeclinablePos = 'verb' | 'auxiliary verb';
type IndeclinablePos = 'noun' | 'noun suffix'  | 'noun particle'
  | 'verb particle'
  | 'sentence particle';

export type ConjugationClass = 'vowel-stem' | 'consonant-stem' | 'c-irregular';

export interface LocalizedString {
  en: string;
  ja?: string;
}

export interface Definition {
  gloss: LocalizedString;
  definition?: LocalizedString;
}

export type DictionaryEntry = {
  id: string;
  script?: string;
  pos: DeclinablePos;
  conjugation_class: ConjugationClass;
  definitions: Definition[];
  notes?: LocalizedString;
  components?: string[];
} | {
  id: string;
  script?: string;
  pos: IndeclinablePos;
  definitions: Definition[];
  notes?: LocalizedString;
  components?: string[];
}

export interface DictionaryData {
  entries: DictionaryEntry[];
}

export interface Token {
  form: string;
  mixed_script?: string;
  entry_ids?: string[];
  gloss?: string;
}

export interface CorpusSentence {
  id: string;
  source?: string;
  tokens: Token[];
  translation: LocalizedString;
}

export interface CorpusData {
  sentences: CorpusSentence[];
}

export interface I18nData {
  pos?: Partial<Record<string, string>>;
  conj?: Partial<Record<string, string>>;
  'count-in-corpus'?: { one?: string; other?: string };
  ui?: Partial<Record<string, string>>;
}

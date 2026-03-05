export type Pos = DeclinablePos | IndeclinablePos;
type DeclinablePos = 'verb' | 'auxiliary verb';
type IndeclinablePos = 'noun'  | 'noun particle'
  | 'verb particle'
  | 'sentence particle';

export type ConjugationClass = 'vowel-stem' | 'consonant-stem' | 'c-irregular';

export interface Definition {
  gloss: string;
  definition?: string;
}

export type DictionaryEntry = {
  id: string;
  script?: string;
  pos: DeclinablePos;
  conjugation_class: ConjugationClass;
  definitions: Definition[];
  notes?: string;
  components?: string[];
} | {
  id: string;
  script?: string;
  pos: IndeclinablePos;
  definitions: Definition[];
  notes?: string;
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
  translation: string;
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

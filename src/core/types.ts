export type DomainId = 'retail' | 'library' | 'courses';
export type Difficulty = 'basic' | 'medium' | 'advanced';
export type Random = () => number;
export type Cell = string | number;
export type Row = Record<string, Cell>;
export type ConfigInput = {
  aiTheme?: unknown;
  generatorVersion?: unknown;
  domain?: unknown;
  seed?: unknown;
  size?: unknown;
  difficulty?: unknown;
};

export interface Config {
  aiTheme?: AiTheme;
  generatorVersion?: 1 | 2 | 3;
  domain: DomainId;
  seed: string;
  size: number;
  difficulty: Difficulty;
}

export interface AiTheme {
  version: 1;
  domain: DomainId;
  model: string;
  title: string;
  description: string;
  values: Record<string, string[]>;
}

export interface AiStatus {
  ready: boolean;
  message: string;
}

export interface Domain {
  id: DomainId;
  name: string;
  subtitle: string;
  color: string;
  icon: string;
  grain: string;
  description: string;
}

export interface SourceData {
  rows: Row[];
  rules: string[];
  questions: string[];
  categorical: string;
  numeric: string;
  time: string;
  distinct: string;
}

export interface Task {
  id: string;
  prompt: string;
  answer: number;
  explanation: string;
}

export interface Dataset extends SourceData {
  modelSources?: CsvSource[];
  sources?: CsvSource[];
  targetTableCount?: number;
  version: number;
  config: Config;
  domain: Domain;
  tasks: Task[];
  headers: string[];
}

export interface CsvSource {
  name: string;
  grain: string;
  headers: string[];
  rows: Row[];
}

export type FormulaSkill =
  'meaning' | 'application' | 'evaluation' | 'debugging';

export interface Question {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  hint: string;
  skill?: FormulaSkill;
}

export interface QuizAnswer {
  choice: number;
  correct: boolean;
  hint: boolean;
}

export interface Quiz {
  questions: Question[];
  topic: string;
  answers: QuizAnswer[];
  pending: QuizAnswer | null;
  hint: boolean;
  completed: boolean;
}

export interface QuizResult {
  time: number;
  topic: string;
  correct: number;
  total: number;
  hints: number;
}

export interface PracticeSession {
  id: string;
  config: Config;
  minutes: number;
  startedAt: number;
  deadline: number;
  finishedAt?: number;
  status: 'running' | 'submitted' | 'expired' | 'interrupted';
  answers: Record<string, string>;
  checks: number[];
  exported: boolean;
}

export type View =
  | 'home'
  | 'quiz'
  | 'generator'
  | 'practice'
  | 'history'
  | 'lesson'
  | 'workbook'
  | 'database';

export interface AppState {
  variantSelected?: boolean;
  version: 1;
  view: View;
  config: Config;
  delimiter: string;
  quiz: Quiz | null;
  quizHistory: QuizResult[];
  session: PracticeSession | null;
  history: PracticeSession[];
  exports: number;
}

export type ExportResult =
  {canceled: true} | {directory: string; count: number; canceled?: false};

export interface DesktopApi {
  openSheets(
    request?: {kind: 'blank' | 'lesson'} | {kind: 'variant'; config: Config},
  ): Promise<void>;
  openSetupPage(tool: 'calc' | 'python' | 'ollama'): Promise<void>;
  platform: string;
  calcStatus(): Promise<CalcResult>;
  openCalcLesson(step: number): Promise<CalcResult>;
  calcWork(step: number, action: 'work' | 'check'): Promise<CalcResult>;
  downloadAiModel(): Promise<AiStatus>;
  aiStatus(): Promise<AiStatus>;
  generateAiTheme(config: Config, topic: string): Promise<AiTheme>;
  cancelAiTheme(): Promise<void>;
  exportDataset(config: Config, delimiter: string): Promise<ExportResult>;
}

export interface CalcResult {
  ready: boolean;
  message: string;
  directory?: string;
  file?: string;
  passed?: boolean;
  issues?: string[];
}

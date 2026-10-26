import {domains, generateDataset, gradeTasks} from './generator.js';
import type {PracticeSession, QuizResult} from './types.js';

/** Validated saved history; practice attempts already have a finishedAt value. */
export interface ProgressHistory {
  history: readonly PracticeSession[];
  quizHistory: readonly QuizResult[];
}

export interface ProgressSummary {
  answered: number;
  correct: number;
  accuracy: number | null;
  minutes: number;
}

export interface ProgressEntry {
  kind: 'practice' | 'quiz';
  id: string;
  time: number;
  name: string;
  subtitle: string;
  result: string;
  badge: string;
}

export interface Achievement {
  name: string;
  description: string;
  icon: string;
  value: number;
  goal: number;
}

function practiceScore(session: PracticeSession): number {
  return gradeTasks(generateDataset(session.config), session.answers).filter(
    grade => grade.correct,
  ).length;
}

/** Computes achievement progress from saved attempts, without changing history. */
export function progressAchievements(progress: ProgressHistory): Achievement[] {
  const hasIndependentQuiz = progress.quizHistory.some(
    quiz => quiz.correct === quiz.total && quiz.hints === 0,
  );
  const bestPracticeScore = progress.history.reduce(
    (best, session) => Math.max(best, practiceScore(session)),
    0,
  );
  const practicedDomains = new Set(
    progress.history.map(session => session.config.domain),
  ).size;
  return [
    {
      name: 'Первый шаг',
      description: 'Завершить первый блиц',
      icon: 'quiz',
      value: Math.min(progress.quizHistory.length, 1),
      goal: 1,
    },
    {
      name: 'Без подсказок',
      description: 'Весь блиц верно и самостоятельно',
      icon: 'medal',
      value: Number(hasIndependentQuiz),
      goal: 1,
    },
    {
      name: 'Точный результат',
      description: 'Все три выборки верны в одной попытке',
      icon: 'check',
      value: bestPracticeScore,
      goal: 3,
    },
    {
      name: 'Новый контекст',
      description: 'Завершить практику в трёх областях',
      icon: 'layers',
      value: practicedDomains,
      goal: 3,
    },
  ];
}

/** Summarizes saved attempts; practice time is rounded per attempt. */
export function summarizeProgress(progress: ProgressHistory): ProgressSummary {
  const answered = progress.quizHistory.reduce(
    (total, quiz) => total + quiz.total,
    0,
  );
  const correct = progress.quizHistory.reduce(
    (total, quiz) => total + quiz.correct,
    0,
  );
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    minutes: progress.history.reduce(
      (total, session) =>
        total + Math.round((session.finishedAt! - session.startedAt) / 60000),
      0,
    ),
  };
}

function practiceEntry(session: PracticeSession): ProgressEntry {
  const correct = practiceScore(session);
  return {
    kind: 'practice',
    id: session.id,
    time: session.finishedAt!,
    name:
      session.config.aiTheme?.title ??
      domains.find(domain => domain.id === session.config.domain)?.name ??
      '',
    subtitle: session.config.seed,
    result: `${correct} / 3`,
    badge: session.status === 'expired' ? 'Время вышло' : 'Завершено',
  };
}

function quizEntry(quiz: QuizResult): ProgressEntry {
  return {
    kind: 'quiz',
    id: '',
    time: quiz.time,
    name: 'Блиц-викторина',
    subtitle: quiz.topic,
    result: `${quiz.correct} / ${quiz.total}`,
    badge: 'Пройдено',
  };
}

/** Merges saved quizzes and practice attempts, newest first, without mutating them. */
export function recentProgress(
  progress: ProgressHistory,
  limit = 100,
): ProgressEntry[] {
  return [
    ...progress.history.map(practiceEntry),
    ...progress.quizHistory.map(quizEntry),
  ]
    .sort((first, second) => second.time - first.time)
    .slice(0, limit);
}

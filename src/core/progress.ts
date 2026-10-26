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
  const correct = gradeTasks(
    generateDataset(session.config),
    session.answers,
  ).filter(grade => grade.correct).length;
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

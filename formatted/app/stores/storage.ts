import {normalizeConfig} from '../../../packages/practice/src/generator.js';
import type {
  AppState,
  PracticeSession,
} from '../../../packages/contracts/practice.js';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  finite(value) && Number.isInteger(value) && value >= min && value <= max;

export function validateSession(session: unknown): PracticeSession {
  if (!record(session) || !record(session.config))
    throw new Error('Invalid session');
  session.config = normalizeConfig({
    ...session.config,
    generatorVersion: session.config.generatorVersion ?? 1,
  });
  if (
    typeof session.status !== 'string' ||
    !['running', 'submitted', 'expired', 'interrupted'].includes(
      session.status,
    ) ||
    typeof session.id !== 'string' ||
    !finite(session.startedAt) ||
    !finite(session.deadline) ||
    session.deadline <= session.startedAt ||
    session.deadline - session.startedAt > 240 * 60000 ||
    !integer(session.minutes, 1, 240) ||
    typeof session.exported !== 'boolean' ||
    !record(session.answers) ||
    !Array.isArray(session.checks) ||
    session.checks.some(i => !integer(i, 0, 3)) ||
    new Set(session.checks).size !== session.checks.length ||
    Object.values(session.answers).some(
      value => typeof value !== 'string' || value.length > 20,
    ) ||
    (session.status !== 'running' &&
      (!finite(session.finishedAt) ||
        session.finishedAt < session.startedAt ||
        session.finishedAt > session.deadline))
  )
    throw new Error('Invalid session');
  return session as unknown as PracticeSession;
}

export function validateState(stored: unknown): AppState {
  if (
    !record(stored) ||
    stored.version !== 1 ||
    !record(stored.config) ||
    !Array.isArray(stored.history) ||
    !Array.isArray(stored.quizHistory)
  )
    throw new Error('Invalid saved state');
  stored.config = normalizeConfig(stored.config);
  stored.variantSelected = stored.variantSelected === true;
  if (
    typeof stored.delimiter !== 'string' ||
    ![';', ','].includes(stored.delimiter) ||
    !integer(stored.exports, 0, Number.MAX_SAFE_INTEGER)
  )
    throw new Error('Invalid settings');
  if (stored.session) validateSession(stored.session);
  stored.history.forEach(item => {
    if (validateSession(item).status === 'running')
      throw new Error('Unfinished history item');
  });
  stored.quizHistory.forEach((item: unknown) => {
    if (
      !record(item) ||
      !finite(item.time) ||
      typeof item.topic !== 'string' ||
      !integer(item.total, 1, 8) ||
      !integer(item.correct, 0, item.total) ||
      !integer(item.hints, 0, item.total)
    )
      throw new Error('Invalid quiz history');
  });
  if (stored.quiz) {
    const q = stored.quiz;
    if (
      !record(q) ||
      !Array.isArray(q.questions) ||
      !q.questions.length ||
      q.questions.length > 8 ||
      !Array.isArray(q.answers) ||
      q.answers.length > q.questions.length ||
      typeof q.completed !== 'boolean' ||
      typeof q.topic !== 'string' ||
      typeof q.hint !== 'boolean' ||
      q.completed !== (q.answers.length === q.questions.length)
    )
      throw new Error('Invalid quiz');
    q.questions.forEach((item: unknown) => {
      if (
        !record(item) ||
        ['id', 'question', 'topic', 'explanation', 'hint'].some(
          k => typeof item[k] !== 'string',
        ) ||
        !Array.isArray(item.options) ||
        item.options.length !== 4 ||
        item.options.some(o => typeof o !== 'string') ||
        !integer(item.correct, 0, 3)
      )
        throw new Error('Invalid question');
    });
    [...q.answers, ...(q.pending ? [q.pending] : [])].forEach(
      (item: unknown) => {
        if (
          !record(item) ||
          !integer(item.choice, 0, 3) ||
          typeof item.correct !== 'boolean' ||
          typeof item.hint !== 'boolean'
        )
          throw new Error('Invalid answer');
      },
    );
  }
  return stored as unknown as AppState;
}

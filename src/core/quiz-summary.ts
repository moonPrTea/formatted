import type {Quiz} from '../../packages/contracts/practice.js';

export function summarizeQuiz(quiz: Pick<Quiz, 'questions' | 'answers'>) {
  const topics = new Map<
    string,
    {topic: string; total: number; correct: number; hinted: number}
  >();
  let independent = 0;
  let hinted = 0;
  let incorrect = 0;
  quiz.questions.forEach((question, index) => {
    const answer = quiz.answers[index];
    if (!answer) return;
    const row = topics.get(question.topic) ?? {
      topic: question.topic,
      total: 0,
      correct: 0,
      hinted: 0,
    };
    row.total++;
    if (answer.correct) {
      row.correct++;
      if (answer.hint) {
        hinted++;
        row.hinted++;
      } else {
        independent++;
      }
    } else {
      incorrect++;
    }
    topics.set(question.topic, row);
  });
  return {
    correct: independent + hinted,
    independent,
    hinted,
    incorrect,
    topics: [...topics.values()],
  };
}

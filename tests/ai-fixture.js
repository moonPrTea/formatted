import {
  AI_MODEL,
  themeFields,
} from '../build/packages/practice/src/ai-theme.js';

export function themeFixture(domain = 'retail') {
  return {
    version: 1,
    domain,
    model: AI_MODEL,
    title: 'Учебная мастерская',
    description:
      'Вымышленная организация ведёт учёт в выбранной предметной области',
    values: Object.fromEntries(
      Object.entries(themeFields[domain]).map(([field, count]) => [
        field,
        Array.from({length: count}, (_, i) => `Учебный ${field} ${i + 1}`),
      ]),
    ),
  };
}

export function modelReply(domain = 'retail') {
  const {title, description, values} = themeFixture(domain);
  return {
    done: true,
    message: {content: JSON.stringify({title, description, values})},
  };
}

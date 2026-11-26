import {runCalcLesson} from '../formatted/electron/calc.js';
import {createOllamaClient} from '../formatted/electron/ollama.js';

console.log(
  `formatted: ${process.platform}/${process.arch}, Node ${process.versions.node}`,
);
const results = await Promise.allSettled([
  runCalcLesson(),
  createOllamaClient().status(),
]);
for (const result of results)
  console.log(
    result.status === 'fulfilled'
      ? result.value.message
      : String(result.reason),
  );
console.log(
  'Блиц, CSV и проверка нормализации не требуют Python, Calc или Ollama',
);

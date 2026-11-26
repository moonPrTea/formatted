import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {calcLesson} from '../../build/packages/practice/src/calc-lesson.js';
import {runCalcLesson} from '../../build/formatted/electron/calc.js';

test('Calc lesson stays limited to the handout formulas and one source CSV', () => {
  assert.equal(calcLesson.steps.length, 7);
  assert.equal(calcLesson.rows.length, 4);
  const functions = calcLesson.steps.flatMap(step =>
    [...(step.formula ?? '').matchAll(/([А-ЯЁ]+)\(/g)].map(match => match[1]),
  );
  assert.deepEqual([...new Set(functions)].sort(), ['ИНДЕКС', 'ПОИСКПОЗ']);
  for (const step of calcLesson.steps) {
    assert.ok(step.instructions.length >= 3);
    assert.ok(step.answer >= 0 && step.answer < step.options.length);
  }
});

test('Calc bridge rejects invalid step input before launching a process', async () => {
  for (const step of [-1, 7, 0.5, '4', NaN])
    await assert.rejects(runCalcLesson(step, '/tmp'), /Неизвестный шаг/);
});

test('Python lesson generation and launch isolation', context => {
  const candidates =
    process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3']];
  const python = candidates.find(
    ([command, ...args]) =>
      spawnSync(command, [...args, '--version'], {encoding: 'utf8'}).status ===
      0,
  );
  if (!python) {
    context.skip('Python 3 is not installed');
    return;
  }
  const [command, ...args] = python;
  const result = spawnSync(
    command,
    [
      ...args,
      '-B',
      '-m',
      'unittest',
      'discover',
      '-s',
      'formatted/tests',
      '-p',
      'calc_*test.py',
    ],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran [1-9]\d* tests/);
  assert.equal(result.stdout, '');
});

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import type {CalcResult} from '../src/core/types.js';

const execute = promisify(execFile);
const script = path.resolve(
  import.meta.dirname,
  '../desktop-tools/calc_lesson.py',
);

export async function runCalcLesson(
  step?: number,
  directory?: string,
  mode: 'example' | 'work' | 'check' = 'example',
): Promise<CalcResult> {
  if (!['example', 'work', 'check'].includes(mode))
    throw new Error('Неизвестный режим урока');
  if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > 6))
    throw new Error('Неизвестный шаг урока');
  const candidates =
    process.platform === 'win32'
      ? [['py', '-3'], ['python'], ['python3']]
      : [['python3']];
  for (const [command, ...prefix] of candidates) {
    try {
      const version = await execute(command, [...prefix, '--version'], {
        timeout: 4000,
        windowsHide: true,
      });
      const match = (version.stdout + version.stderr).match(
        /Python (\d+)\.(\d+)/,
      );
      if (
        !match ||
        Number(match[1]) < 3 ||
        (Number(match[1]) === 3 && Number(match[2]) < 9)
      )
        continue;
    } catch {
      continue;
    }
    const args =
      step === undefined
        ? ['--status']
        : [
            '--step',
            String(step),
            '--output',
            directory!,
            ...(mode === 'example'
              ? []
              : [mode === 'work' ? '--work' : '--check']),
          ];
    try {
      const result = await execute(command, [...prefix, script, ...args], {
        timeout: 15_000,
        maxBuffer: 64_000,
        windowsHide: true,
        env: {...process.env, PYTHONIOENCODING: 'utf-8'},
      });
      const parsed: unknown = JSON.parse(result.stdout);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('message' in parsed) ||
        typeof parsed.message !== 'string' ||
        !('ready' in parsed) ||
        typeof parsed.ready !== 'boolean'
      )
        throw new Error('Неверный ответ учебного скрипта');
      return parsed as CalcResult;
    } catch {
      throw new Error(
        'Не удалось запустить учебный скрипт Python. Проверь Python 3.9+ и доступ к папке приложения',
      );
    }
  }
  return {
    ready: false,
    message:
      'Python 3.9+ не найден. Установи Python с python.org; урок внутри приложения доступен без него',
  };
}

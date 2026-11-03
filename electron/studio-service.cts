import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {setTimeout, clearTimeout} from 'node:timers';
import type {StudioRequest} from '../src/studio/model.js';

export class StudioService {
  private child?: ChildProcessWithoutNullStreams;
  private counter = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private executable: string,
    private args: string[] = [],
  ) {}
  private start() {
    if (this.child) return this.child;
    const child = spawn(this.executable, this.args, {
      stdio: 'pipe',
      windowsHide: true,
      env: {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1'},
    });
    this.child = child;
    const lines = createInterface({input: child.stdout});
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(String(message.error)));
        else entry.resolve(message.result);
      } catch {
        this.stop(new Error('Некорректный ответ сервиса C#'));
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', error => this.stop(error));
    child.on('exit', () => {
      if (this.child === child)
        this.stop(new Error('Сервис C# завершился. Повтори запрос.'));
    });
    return child;
  }
  request(
    request:
      | (StudioRequest & {references?: string[]})
      | {operation: 'package-version'; range: string; versions: string[]}
      | {operation: 'package-validate'; references: string[]}
      | {
          operation: 'package-install';
          archive: string;
          destination: string;
          packageId: string;
          version: string;
        },
  ): Promise<unknown> {
    if (this.pending.size >= 12)
      return Promise.reject(new Error('Сервис C# занят'));
    const child = this.start(),
      id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.stop(new Error('Сервис C# превысил время ожидания')),
        20_000,
      );
      this.pending.set(id, {resolve, reject, timer});
      child.stdin.write(JSON.stringify({...request, id}) + '\n', error => {
        if (error) this.stop(error);
      });
    });
  }
  stop(error = new Error('Сервис C# остановлен')) {
    const child = this.child;
    this.child = undefined;
    child?.kill();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }
}

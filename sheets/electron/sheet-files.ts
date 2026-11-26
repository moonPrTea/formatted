import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {
  atomicWrite,
  atomicWriteAsync,
  digest,
  readText,
} from './sheet-store.js';
import type {DocumentBoot, SheetSnapshot} from '../app/services/document.js';

interface DocumentState {
  id: string;
  snapshot?: SheetSnapshot;
  file?: string;
  hash?: string;
  last?: string;
  busy?: boolean;
  pending?: Promise<boolean>;
}
const documents = new Map<BrowserWindow, DocumentState>();
const directory = () => path.join(app.getPath('userData'), 'sheet-recovery');
const recoveryPath = (id: string) => path.join(directory(), `${id}.json`);
export function attachDocument(window: BrowserWindow, state?: DocumentState) {
  documents.set(window, state ?? {id: randomUUID()});
  window.on('closed', async () => {
    const current = documents.get(window)!;
    await current.pending;
    if (
      current.snapshot &&
      !current.snapshot.dirty &&
      !current.snapshot.draft
    ) {
      try {
        fs.unlinkSync(recoveryPath(current.id));
      } catch {
        /* Keep a recoverable copy on failure. */
      }
    }
    documents.delete(window);
  });
}
export async function restoreDocuments(create: (state: DocumentState) => void) {
  const {readSnapshot} = await import('../app/services/document.js');
  if (!fs.existsSync(directory())) return false;
  let restored = false;
  const active = new Set([...documents.values()].map(state => state.id));
  let names: string[];
  try {
    names = fs.readdirSync(directory());
  } catch {
    dialog.showErrorBox(
      'formatted',
      `Папка восстановления недоступна:\n${directory()}`,
    );
    return false;
  }
  for (const name of names) {
    if (!/^[\da-f-]{36}\.json$/.test(name) || active.has(name.slice(0, -5)))
      continue;
    let english = false;
    try {
      const value = JSON.parse(
        readText(path.join(directory(), name)),
      ) as DocumentState;
      english = value.snapshot?.language === 'en';
      const snapshot = readSnapshot(value.snapshot);
      if (
        value.file !== undefined &&
        (typeof value.file !== 'string' || !path.isAbsolute(value.file))
      )
        throw new Error('Invalid path');
      create({
        id: name.slice(0, -5),
        snapshot,
        file: value.file,
        hash: value.hash,
      });
      restored = true;
    } catch {
      dialog.showErrorBox(
        'formatted',
        `${english ? 'Could not restore workbook. The file was kept for manual recovery' : 'Не удалось восстановить книгу. Файл сохранён для восстановления вручную'}:\n${name}\n${directory()}`,
      );
    }
  }
  return restored;
}
export function registerSheetFiles(create: (state: DocumentState) => void) {
  let validate: ((value: unknown) => SheetSnapshot) | undefined;
  const schema = import('../app/services/document.js').then(module => {
    validate = module.readSnapshot;
    return module;
  });
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      !documents.has(window) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Untrusted editor');
    return {window, state: documents.get(window)!};
  };
  ipcMain.handle('sheet-boot', async (event): Promise<DocumentBoot> => {
    await schema;
    const {state} = trusted(event);
    return {
      snapshot: state.snapshot,
      name: state.file && path.basename(state.file),
    };
  });
  const checkpoint = (
    event: IpcMainEvent | IpcMainInvokeEvent,
    text: unknown,
  ) => {
    const {state} = trusted(event);
    const write = async () => {
      try {
        if (
          typeof text !== 'string' ||
          Buffer.byteLength(text) > 8 * 1024 * 1024
        )
          throw new Error('Invalid snapshot');
        if (text !== state.last || !fs.existsSync(recoveryPath(state.id))) {
          if (!validate) throw new Error('Not ready');
          const snapshot = validate(JSON.parse(text));
          const content = JSON.stringify({
            snapshot,
            file: state.file,
            hash: state.hash,
          });
          if (Buffer.byteLength(content) > 8 * 1024 * 1024)
            throw new Error('Recovery is too large');
          await fs.promises.mkdir(directory(), {recursive: true, mode: 0o700});
          await atomicWriteAsync(recoveryPath(state.id), content);
          state.snapshot = snapshot;
          state.last = text;
        }
        return true;
      } catch {
        return false;
      }
    };
    // One ordered writer per document: a slow old write must never replace a new one.
    state.pending = (state.pending ?? Promise.resolve(true)).then(write);
    return state.pending;
  };
  ipcMain.handle('sheet-checkpoint-async', checkpoint);
  // Only closing needs a synchronous renderer acknowledgement; main stays responsive.
  ipcMain.on('sheet-checkpoint', (event, text: unknown) => {
    try {
      void checkpoint(event, text).then(saved => {
        event.returnValue = saved;
      });
    } catch {
      event.returnValue = false;
    }
  });
  ipcMain.handle(
    'sheet-file',
    async (event, command: unknown, text: unknown) => {
      const {window, state} = trusted(event);
      if (!['open', 'save', 'save-as'].includes(String(command)) || state.busy)
        return {canceled: true};
      state.busy = true;
      try {
        await state.pending;
        const {readDocument, documentOf} =
          await import('../app/services/document.js');
        const filters = [{name: 'formatted', extensions: ['formatted']}];
        if (command === 'open') {
          const choice = await dialog.showOpenDialog(window, {
            filters,
            properties: ['openFile'],
          });
          if (choice.canceled || !choice.filePaths[0]) return {canceled: true};
          const file = fs.realpathSync(choice.filePaths[0]);
          const existing = [...documents].find(([, doc]) => doc.file === file);
          if (existing) {
            existing[0].show();
            existing[0].focus();
            return {canceled: true};
          }
          const content = readText(file);
          const book = readDocument(JSON.parse(content));
          create({
            id: randomUUID(),
            file,
            hash: digest(content),
            snapshot: {
              document: documentOf(book),
              language: state.snapshot?.language ?? 'ru',
              sheet: book.getSheetNames()[0],
              address: 'A1',
              dirty: false,
            },
          });
          return {canceled: true};
        }
        if (
          typeof text !== 'string' ||
          Buffer.byteLength(text) > 8 * 1024 * 1024
        )
          throw new Error('Invalid document');
        const content = JSON.stringify(
          documentOf(readDocument(JSON.parse(text))),
          null,
          2,
        );
        if (Buffer.byteLength(content) > 8 * 1024 * 1024)
          throw new Error('File is too large');
        let file = state.file;
        if (!file || command === 'save-as') {
          const choice = await dialog.showSaveDialog(window, {
            filters,
            defaultPath: file ?? 'Workbook.formatted',
          });
          if (choice.canceled || !choice.filePath) return {canceled: true};
          file = choice.filePath;
          if (fs.existsSync(file)) file = fs.realpathSync(file);
          if (
            [...documents].some(
              ([other, doc]) => other !== window && doc.file === file,
            )
          )
            return {error: 'opened'};
        } else if (
          !fs.existsSync(file) ||
          digest(readText(file)) !== state.hash
        )
          return {error: 'conflict'};
        atomicWrite(file, content);
        state.file = file;
        state.hash = digest(content);
        state.last = undefined;
        return {name: path.basename(file)};
      } catch {
        return {error: 'file'};
      } finally {
        state.busy = false;
      }
    },
  );
}

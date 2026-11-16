import {
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type Rectangle,
  type WebContents,
  type IpcMainEvent,
} from 'electron';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {SheetLaunch} from '../src/sheets/launch.js';
import {
  attachDocument,
  registerSheetFiles,
  restoreDocuments,
} from './sheet-files.js';

let editor: BrowserWindow | null = null;
const editors = new Set<BrowserWindow>();
const languages = new WeakMap<BrowserWindow, string>();
let documentNumber = 0;
function trustedEditor(event: IpcMainEvent, language: unknown) {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window &&
    editors.has(window) &&
    event.senderFrame === event.sender.mainFrame &&
    (language === 'ru' || language === 'en')
    ? window
    : null;
}
ipcMain.on('sheet-new-document', (event, language: unknown) => {
  if (trustedEditor(event, language)) createEditor(true, language as string);
});
ipcMain.on('sheet-language', (event, language: unknown) => {
  const window = trustedEditor(event, language);
  if (window) languages.set(window, language as string);
});
ipcMain.on(
  'sheet-menu',
  (event, language: unknown, sheet: unknown, count: unknown) => {
    const window = trustedEditor(event, language);
    if (
      !window ||
      typeof sheet !== 'string' ||
      !sheet.trim() ||
      sheet.length > 100 ||
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 128
    )
      return;
    const send = (command: string) => {
      if (!window.isDestroyed())
        window.webContents.send('sheet-command', command, sheet);
    };
    Menu.buildFromTemplate([
      {
        label: language === 'ru' ? 'Создать новый лист' : 'New sheet',
        click: () => send('add-sheet'),
      },
      {
        label: language === 'ru' ? 'Переименовать лист' : 'Rename sheet',
        click: () => send('rename-sheet'),
      },
      {type: 'separator'},
      {
        label: language === 'ru' ? 'Удалить лист' : 'Delete sheet',
        enabled: count > 1,
        click: () => send('delete-sheet'),
      },
    ]).popup({window});
  },
);
const expanded = new WeakMap<BrowserWindow, Rectangle>();
ipcMain.on('sheet-range-picking', (event, active: unknown) => {
  const child = BrowserWindow.fromWebContents(event.sender);
  if (
    typeof active !== 'boolean' ||
    !child ||
    !editors.has(child.getParentWindow()!) ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame.url !== 'forma://app/sheets/wizard.html'
  )
    return;
  if (active && !expanded.has(child)) {
    expanded.set(child, child.getBounds());
    child.setMinimumSize(360, 96);
    const zoom = child.webContents.getZoomFactor();
    child.setContentSize(Math.round(420 * zoom), Math.round(90 * zoom));
    child.setAlwaysOnTop(true);
    child.getParentWindow()?.focus();
  } else if (!active && expanded.has(child)) {
    child.setMinimumSize(360, 400);
    child.setBounds(expanded.get(child)!);
    expanded.delete(child);
    child.setAlwaysOnTop(false);
    child.focus();
  }
});
const launches = new Map<string, BrowserWindow>();
export async function openSheets(request?: SheetLaunch) {
  if (request) {
    const {launchSnapshot} = await import('../src/sheets/launch.js');
    const key = JSON.stringify(request);
    const existing = launches.get(key);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }
    const snapshot = launchSnapshot(request);
    const window = createEditor(request.kind === 'blank', 'ru', {
      id: randomUUID(),
      snapshot,
    });
    launches.set(key, window);
    window.on('closed', () => launches.delete(key));
    return;
  }
  if (editor) {
    if (editor.isMinimized()) editor.restore();
    editor.show();
    editor.focus();
    return;
  }
  createEditor();
}
export const restoreSheets = () =>
  restoreDocuments(state =>
    createEditor(false, state.snapshot?.language, state),
  );
registerSheetFiles(state =>
  createEditor(false, state.snapshot?.language, state),
);
function createEditor(
  blank = false,
  language = 'ru',
  restored?: Parameters<typeof attachDocument>[1],
) {
  const url =
    'forma://app/sheets/index.html' +
    (blank ? `?blank=1&language=${language}&document=${++documentNumber}` : '');
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(import.meta.dirname, 'sheets-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  editor = window;
  attachDocument(window, restored);
  editors.add(window);
  languages.set(window, language);
  window.on('focus', () => {
    editor = window;
  });
  const shortcut = (contents: WebContents) =>
    contents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.meta || input.control) &&
        !input.alt &&
        (!input.shift || input.code === 'KeyS') &&
        ['KeyN', 'KeyO', 'KeyS'].includes(input.code)
      ) {
        event.preventDefault();
        if (!input.isAutoRepeat)
          window.webContents.send(
            'sheet-command',
            input.code === 'KeyN'
              ? 'new-document'
              : input.code === 'KeyO'
                ? 'open'
                : input.shift
                  ? 'save-as'
                  : 'save',
          );
      }
    });
  shortcut(window.webContents);
  window.webContents.setWindowOpenHandler(({url: target}) =>
    target === 'forma://app/sheets/wizard.html'
      ? {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: window,
            modal: false,
            show: false,
            backgroundColor: window.getBackgroundColor(),
            width: 700,
            height: 680,
            minWidth: 360,
            minHeight: 400,
            webPreferences: {
              preload: path.join(import.meta.dirname, 'wizard-preload.cjs'),
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
            },
          },
        }
      : {action: 'deny'},
  );
  window.webContents.on('did-create-window', child => {
    child.once('ready-to-show', () => child.show());
    shortcut(child.webContents);
    child.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    child.webContents.on('will-navigate', (event, target) => {
      if (target !== 'forma://app/sheets/wizard.html') event.preventDefault();
    });
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (target !== url) event.preventDefault();
  });
  window.webContents.on('will-prevent-unload', event => {
    const ru = languages.get(window) !== 'en';
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: ru ? 'Изменения не сохранены' : 'Unsaved changes',
      detail: ru
        ? 'Не удалось записать копию восстановления. Не закрывай окно: сохрани книгу в файл'
        : 'Recovery could not be written. Keep this window open and save the workbook to a file',
      buttons: ru ? ['Остаться', 'Закрыть'] : ['Stay', 'Close'],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) event.preventDefault();
  });
  window.on('closed', () => {
    editors.delete(window);
    if (editor === window) editor = [...editors].at(-1) ?? null;
  });
  void window.loadURL(url);
  window.once('ready-to-show', () => window.show());
  return window;
}

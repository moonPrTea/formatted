import {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  dialog,
  session,
  Menu,
  shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import type {ConfigInput, ExportResult} from '../src/core/types.js';
import {createOllamaClient} from './ollama.cjs';
import type {IpcMainInvokeEvent} from 'electron';
import {runCalcLesson} from './calc.cjs';
import {openSheets, restoreSheets} from './sheets.cjs';

// Keep the existing profile and origin so the rename preserves progress.
app.setPath(
  'userData',
  app.commandLine.getSwitchValue('user-data-dir') ||
    path.join(app.getPath('appData'), app.isPackaged ? 'Forma' : 'forma-exam'),
);
app.setName('formatted');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'forma',
    privileges: {standard: true, secure: true, supportFetchAPI: true},
  },
]);
const root = path.resolve(__dirname, '../src');
const trusted = 'forma://app/index.html';

async function setup() {
  const ai = createOllamaClient();
  const trustedAi = (event: IpcMainInvokeEvent) => {
    if (
      event.senderFrame?.url !== trusted ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Untrusted request');
  };
  ipcMain.handle('open-sheets', (event, request) => {
    trustedAi(event);
    return openSheets(request ?? {kind: 'blank'});
  });
  ipcMain.handle('setup-page', (event, tool: string) => {
    trustedAi(event);
    const links: Record<string, string> = {
      calc: 'https://www.libreoffice.org/download/download-libreoffice/',
      python: 'https://www.python.org/downloads/',
      ollama: 'https://ollama.com/download',
    };
    if (!Object.hasOwn(links, tool)) throw new Error('Unknown setup page');
    return shell.openExternal(links[tool]);
  });
  ipcMain.handle('ai-status', event => {
    trustedAi(event);
    return ai.status();
  });
  ipcMain.handle('calc-status', event => {
    trustedAi(event);
    return runCalcLesson();
  });
  ipcMain.handle('calc-lesson', (event, step: number) => {
    trustedAi(event);
    return runCalcLesson(
      step,
      path.join(app.getPath('userData'), 'calc-lessons'),
    );
  });
  ipcMain.handle(
    'calc-work',
    (event, step: number, action: 'work' | 'check') => {
      trustedAi(event);
      if (!['work', 'check'].includes(action))
        throw new Error('Unknown lesson action');
      return runCalcLesson(
        step,
        path.join(app.getPath('userData'), 'calc-lessons'),
        action,
      );
    },
  );
  ipcMain.handle('ai-generate', (event, config: ConfigInput, topic: string) => {
    trustedAi(event);
    return ai.generate(config, topic);
  });
  ipcMain.handle('ai-cancel', event => {
    trustedAi(event);
    ai.cancel();
  });
  ipcMain.handle('ai-download', async event => {
    trustedAi(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent) throw new Error('Window unavailable');
    const choice = await dialog.showMessageBox(parent, {
      type: 'question',
      title: 'Скачать локальную модель?',
      message: 'Qwen займёт около 2,5 ГБ на диске',
      detail:
        'Ollama скачает модель из интернета. Тема задания и файлы не отправляются. После загрузки генерация работает локально, без аккаунта и API-ключа',
      buttons: ['Отмена', 'Скачать'],
      defaultId: 0,
      cancelId: 0,
    });
    return choice.response === 1
      ? ai.download()
      : {ready: false, message: 'Загрузка не начата'};
  });
  app.on('before-quit', () => ai.cancel());
  if (process.platform === 'darwin' && app.dock)
    app.dock.setIcon(path.join(root, 'assets/forma.png'));
  protocol.handle('forma', request => {
    const url = new URL(request.url);
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (url.host !== 'app' || !file.startsWith(root + path.sep))
      return new Response('Forbidden', {status: 403});
    return net.fetch(pathToFileURL(file).href);
  });
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle(
    'export-dataset',
    async (
      event,
      config: ConfigInput,
      delimiter: string,
    ): Promise<ExportResult> => {
      if (
        event.senderFrame?.url !== trusted ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error('Untrusted request');
      const {exportFiles} = await import('../src/core/generator.js');
      const files = exportFiles(config, delimiter);
      const parent = BrowserWindow.fromWebContents(event.sender);
      if (!parent) throw new Error('Window unavailable');
      const choice = await dialog.showOpenDialog(parent, {
        title: 'Куда сохранить учебный вариант?',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (choice.canceled) return {canceled: true};
      const directory = await fs.mkdtemp(
        path.join(choice.filePaths[0], 'formatted-'),
      );
      try {
        for (const file of files)
          await fs.writeFile(path.join(directory, file.name), file.content, {
            encoding: 'utf8',
            flag: 'wx',
          });
      } catch (error) {
        throw new Error(
          `Не удалось записать весь набор в ${directory}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {directory, count: files.length};
    },
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 650,
    icon: path.join(root, 'assets/forma.png'),
    title: 'formatted - подготовка к экзамену',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? {trafficLightPosition: {x: 18, y: 19}}
      : {
          titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#22272b',
            height: 54,
          },
        }),
    backgroundColor: '#f1f4f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== trusted) event.preventDefault();
  });
  void window.loadURL(trusted);
  return window;
}

function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      await setup();
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === 'darwin'
            ? [
                {
                  label: 'formatted',
                  submenu: [
                    {role: 'about' as const},
                    {type: 'separator' as const},
                    {role: 'quit' as const},
                  ],
                },
              ]
            : []),
          {
            label: 'Правка',
            submenu: [
              {role: 'undo'},
              {role: 'redo'},
              {type: 'separator'},
              {role: 'cut'},
              {role: 'copy'},
              {role: 'paste'},
              {role: 'selectAll'},
            ],
          },
          {
            label: 'Вид',
            submenu: [
              {role: 'reload'},
              {role: 'resetZoom'},
              {role: 'zoomIn'},
              {role: 'zoomOut'},
              {role: 'togglefullscreen'},
            ],
          },
        ]),
      );
      createWindow();
      await restoreSheets();
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) createWindow();
      });
    })
    .catch((error: unknown) => {
      dialog.showErrorBox('Не удалось открыть formatted', String(error));
      app.exit(1);
    });
  app.on('window-all-closed', () => {
    app.quit();
  });
}
export {setup, createWindow, start};

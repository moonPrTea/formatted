import {contextBridge, ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('windowAppearance', {
  setMode: (mode: 'light' | 'dark') =>
    ipcRenderer.send('appearance-mode', mode),
});

contextBridge.exposeInMainWorld('sheetDesktop', {
  boot: () => ipcRenderer.invoke('sheet-boot'),
  checkpoint: (text: string) => ipcRenderer.sendSync('sheet-checkpoint', text),
  checkpointAsync: (text: string) =>
    ipcRenderer.invoke('sheet-checkpoint-async', text),
  file: (command: string, text?: string) =>
    ipcRenderer.invoke('sheet-file', command, text),
  setLanguage: (language: string) =>
    ipcRenderer.send('sheet-language', language),
  menu: (language: string, sheet: string, count: number) =>
    ipcRenderer.send('sheet-menu', language, sheet, count),
  newDocument: (language: string) =>
    ipcRenderer.send('sheet-new-document', language),
  onCommand: (callback: (command: string, sheet?: string) => void) => {
    ipcRenderer.on('sheet-command', (_event, command: string, sheet?: string) =>
      callback(command, sheet),
    );
  },
});

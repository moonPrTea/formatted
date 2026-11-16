import {contextBridge, ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('windowAppearance', {
  setMode: (mode: 'light' | 'dark') =>
    ipcRenderer.send('appearance-mode', mode),
});

contextBridge.exposeInMainWorld('rangeWindow', {
  setPicking: (active: boolean) =>
    ipcRenderer.send('sheet-range-picking', active),
});

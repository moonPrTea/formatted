import type {DesktopApi} from '../src/core/types.js';
import {contextBridge, ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('windowAppearance', {
  setMode: (mode: 'light' | 'dark') =>
    ipcRenderer.send('appearance-mode', mode),
});
const desktop: DesktopApi = {
  openSheets: request => ipcRenderer.invoke('open-sheets', request),
  openSetupPage: tool => ipcRenderer.invoke('setup-page', tool),
  platform: process.platform,
  calcStatus: () => ipcRenderer.invoke('calc-status'),
  openCalcLesson: step => ipcRenderer.invoke('calc-lesson', step),
  calcWork: (step, action) => ipcRenderer.invoke('calc-work', step, action),
  downloadAiModel: () => ipcRenderer.invoke('ai-download'),
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  generateAiTheme: (config, topic) =>
    ipcRenderer.invoke('ai-generate', config, topic),
  cancelAiTheme: () => ipcRenderer.invoke('ai-cancel'),
  exportDataset: (config, delimiter) =>
    ipcRenderer.invoke('export-dataset', config, delimiter),
};
contextBridge.exposeInMainWorld('desktop', desktop);

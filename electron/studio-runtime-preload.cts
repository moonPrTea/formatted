import {contextBridge, ipcRenderer} from 'electron';
import type {
  RuntimeEvent,
  RuntimeSnapshot,
} from '../src/studio/runtime-model.js';
contextBridge.exposeInMainWorld('formRuntime', {
  event: (value: RuntimeEvent) =>
    ipcRenderer.send('studio-runtime-event', value),
  onSnapshot: (callback: (value: RuntimeSnapshot) => void) =>
    ipcRenderer.on('studio-runtime-snapshot', (_event, value) =>
      callback(value),
    ),
});

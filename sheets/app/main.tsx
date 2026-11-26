import '../../packages/ui/services/theme.js';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SheetsShell} from './components/sheets-shell.js';
import {observeControls} from '../../packages/ui/services/controls.js';

const container = document.getElementById('tables-root')!;
flushSync(() =>
  createRoot(container, {identifierPrefix: 'tables-ui'}).render(
    <SheetsShell />,
  ),
);
observeControls(document.body);
await import('./pages/editor.js');

import {createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {AppShell} from './components/app-shell.js';
import type {ShellProps} from './shell-types.js';

let root: Root | undefined;
let contentKey = 0;
let previousView: ShellProps['view'] | undefined;

export function renderAppShell(container: HTMLElement, props: ShellProps) {
  root ??= createRoot(container);
  flushSync(() =>
    root!.render(createElement(AppShell, {...props, contentKey: ++contentKey})),
  );
  if (previousView !== props.view)
    container.querySelector('#main')?.scrollTo(0, 0);
  previousView = props.view;
}

export function showConfirmation(open: boolean) {
  document.dispatchEvent(new CustomEvent('formatted-confirm', {detail: open}));
}

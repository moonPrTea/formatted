import {createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SectionTabs} from '../components/section-tabs.js';
import type {WorkspaceSection} from '../types/shell.js';
import type {View} from '../../../packages/contracts/practice.js';
import {closeSelectMenu} from '../../../packages/ui/services/select-menu.js';

const selectedSectionByWorkspace = new Map<string, string>();
const mountedWorkspaces = new Set<{host: HTMLElement; root: Root}>();
let nextWorkspaceId = 0;

function unmountDetachedWorkspaces() {
  for (const workspace of mountedWorkspaces) {
    if (workspace.host.isConnected) continue;
    workspace.root.unmount();
    mountedWorkspaces.delete(workspace);
  }
}

function renderWorkspaceSections(
  container: HTMLElement,
  workspaceName: string,
  sections: WorkspaceSection[],
) {
  if (!sections.length) return;

  const host = document.createElement('div');
  host.className = 'sections-host';
  host.dataset.workspace = workspaceName;
  container.replaceChildren(host);
  unmountDetachedWorkspaces();
  const root = createRoot(host, {
    identifierPrefix: `section-${++nextWorkspaceId}`,
  });
  const savedSelection = selectedSectionByWorkspace.get(workspaceName);
  const selected = sections.some(section => section.value === savedSelection)
    ? savedSelection!
    : sections[0].value;
  const onSelect = (value: string) => {
    closeSelectMenu();
    selectedSectionByWorkspace.set(workspaceName, value);
    root.render(
      createElement(SectionTabs, {sections, selected: value, onSelect}),
    );
  };
  flushSync(() =>
    root.render(createElement(SectionTabs, {sections, selected, onSelect})),
  );
  mountedWorkspaces.add({host, root});
}

export function mountSections(view: View) {
  unmountDetachedWorkspaces();

  const screenContent = document.querySelector<HTMLElement>(
    '#main .screen-content',
  );
  if (!screenContent) return;

  if (view === 'generator') {
    const getSectionMarkup = (selector: string) =>
      screenContent.querySelector<HTMLElement>(selector)?.outerHTML ?? '';
    const sections: WorkspaceSection[] = [
      {
        value: 'variant',
        label: 'Вариант',
        content: getSectionMarkup('.config-panel'),
      },
      {
        value: 'data',
        label: 'Данные и задания',
        content: getSectionMarkup('.generator-right'),
      },
      {
        value: 'schema',
        label: 'Проверка схемы',
        content: getSectionMarkup('.normalization-panel'),
      },
      {
        value: 'rules',
        label: 'Правила',
        content: getSectionMarkup('.rules-panel'),
      },
      {value: 'ai', label: 'ИИ-тема', content: getSectionMarkup('.ai-panel')},
    ].filter(section => section.content);
    const introduction = [...screenContent.children].filter(element =>
      element.matches('.page-heading, .notice'),
    );
    const host = document.createElement('div');
    screenContent.replaceChildren(...introduction, host);
    renderWorkspaceSections(host, view, sections);
  }

  if (view === 'lesson') {
    const lessonBody = screenContent.querySelector<HTMLElement>('.lesson-body');
    if (!lessonBody) return;
    const example =
      lessonBody.querySelector('.lesson-example')?.outerHTML ?? '';
    const dictionary =
      lessonBody.querySelector('.lesson-dictionary')?.outerHTML ?? '';
    const question =
      lessonBody.querySelector('.lesson-question')?.outerHTML ?? '';
    const controls =
      lessonBody.querySelector('.lesson-controls')?.outerHTML ?? '';
    const extractedSectionSelectors =
      '.lesson-example, .lesson-dictionary, .lesson-question, .lesson-controls';
    lessonBody
      .querySelectorAll(extractedSectionSelectors)
      .forEach(node => node.remove());
    const taskMarkup = lessonBody.innerHTML;
    renderWorkspaceSections(lessonBody, view, [
      {value: 'task', label: 'Задание', content: taskMarkup},
      {value: 'example', label: 'Пример', content: example + dictionary},
      {value: 'check', label: 'Проверка', content: question},
    ]);
    if (controls) lessonBody.insertAdjacentHTML('beforeend', controls);
  }

  if (view === 'workbook') {
    const launch = screenContent.querySelector<HTMLElement>('.calc-launch');
    if (!launch) return;
    const workbookSections = [
      {value: 'editor', label: 'Редактор таблиц'},
      {value: 'work', label: 'Моя книга'},
      {value: 'examples', label: 'Примеры Calc'},
    ];
    const sections = workbookSections.flatMap(section => {
      const option = launch.querySelector<HTMLElement>(
        `[data-workbook-section="${section.value}"]`,
      );
      if (!option) return [];
      option.className = 'panel workbook-panel';
      return {
        ...section,
        content: option.outerHTML,
      };
    });
    renderWorkspaceSections(launch, 'workbook', sections);
  }
}

export function disposeSections() {
  for (const workspace of mountedWorkspaces) workspace.root.unmount();
  mountedWorkspaces.clear();
}

export function selectWorkspaceSection(workspace: string, section: string) {
  const tab = document.querySelector<HTMLElement>(
    `[data-workspace="${workspace}"] [role="tab"][data-ui-value="${section}"]`,
  );
  if (tab?.getAttribute('aria-selected') !== 'true')
    flushSync(() => tab?.click());
}

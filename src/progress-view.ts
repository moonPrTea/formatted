import {escapeHtml, html} from './dom.js';
import type {ProgressEntry} from './core/progress.js';

interface EmptyHistoryMessage {
  title: string;
  description: string;
}

/** Formats the date shared by history rows and practice reports. */
export function formatProgressDate(time: number): string {
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
}

/** Renders history from prepared entries; the icon renderer supplies trusted SVG. */
export function renderHistoryTable(
  entries: readonly ProgressEntry[],
  icon: (name: string) => string,
  emptyMessage: EmptyHistoryMessage,
): string {
  if (!entries.length) {
    return html`<div class="panel history-panel">
      <div class="empty-state">
        ${icon('chart')}
        <h3>${escapeHtml(emptyMessage.title)}</h3>
        <p>${escapeHtml(emptyMessage.description)}</p>
      </div>
    </div>`;
  }
  return html`<div class="panel history-panel">
    <div class="table-scroll">
      <table class="history-table">
        <thead>
          <tr>
            <th>ПОПЫТКА</th>
            <th>ДАТА</th>
            <th>РЕЗУЛЬТАТ</th>
            <th>СТАТУС</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              entry =>
                html`<tr>
                  <td>
                    <div class="history-name">
                      ${icon(entry.kind === 'quiz' ? 'quiz' : 'database')}
                      <div>
                        ${
                          entry.kind === 'practice'
                            ? html`<button
                                class="text-button history-link"
                                data-action="open-report"
                                data-id="${escapeHtml(entry.id)}"
                              >
                                ${escapeHtml(entry.name)}
                              </button>`
                            : escapeHtml(entry.name)
                        }<small>${escapeHtml(entry.subtitle)}</small>
                      </div>
                    </div>
                  </td>
                  <td>${formatProgressDate(entry.time)}</td>
                  <td><b>${escapeHtml(entry.result)}</b></td>
                  <td>
                    <span class="pill subtle">${escapeHtml(entry.badge)}</span>
                  </td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

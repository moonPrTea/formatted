import {html} from '../../../packages/ui/services/dom.js';

export function environmentView() {
  return html`<section class="environment-panel">
    <h2>Подготовка к практике</h2>
    <p>Блиц, генератор и проверка CSV готовы к работе</p>
    ${
      window.desktop
        ? html`<button class="button secondary" data-action="check-environment">
              Проверить окружение
            </button>
            <div class="environment-tools">
              <div>
                <span
                  ><strong>LibreOffice</strong
                  ><small>Практика в Calc</small></span
                ><button
                  class="button ghost"
                  data-action="setup-page"
                  data-tool="calc"
                >
                  Скачать LibreOffice
                </button>
              </div>
              <div>
                <span
                  ><strong>Python 3.9+</strong
                  ><small>Проверка учебных книг</small></span
                ><button
                  class="button ghost"
                  data-action="setup-page"
                  data-tool="python"
                >
                  Скачать Python
                </button>
              </div>
              <div>
                <span
                  ><strong>Ollama</strong
                  ><small>Генерация своей темы</small></span
                ><button
                  class="button ghost"
                  data-action="setup-page"
                  data-tool="ollama"
                >
                  Скачать Ollama
                </button>
              </div>
            </div>`
        : '<p>Запусти desktop-приложение для проверки программ</p>'
    }
    <p class="environment-status" role="status" aria-live="polite"></p>
    <p class="small-note">Ссылки ведут на официальные сайты</p>
  </section>`;
}

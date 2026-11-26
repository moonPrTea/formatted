import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {House} from 'lucide-react';
import {ActionButton} from '../../packages/ui/components/action-button.js';
import {SelectControl} from '../../packages/ui/components/select-control.js';
import {ThemePicker} from '../../packages/ui/components/theme-picker.js';

const select = document.querySelector<HTMLSelectElement>('#source-select')!;
let closeMenu = () => {};
let presses = 0;
let actions = 0;
let changes = 0;
document.addEventListener('formatted-action', () => {
  document.body.dataset.actions = String(++actions);
});
document.addEventListener('controls-close', () => closeMenu());
select.addEventListener('change', () => {
  document.body.dataset.changes = String(++changes);
});
flushSync(() =>
  createRoot(document.querySelector('#app')!).render(
    <main>
      <ActionButton
        id="action"
        data-action="open"
        onPress={() => {
          document.body.dataset.presses = String(++presses);
        }}
      >
        <House />
        Открыть
      </ActionButton>
      <ActionButton id="disabled-action" isDisabled>
        Недоступно
      </ActionButton>
      <SelectControl
        select={select}
        label="Сложность"
        id="difficulty"
        registerClose={close => {
          closeMenu = close;
        }}
      />
      <ActionButton id="after">Далее</ActionButton>
      <ThemePicker />
    </main>,
  ),
);
document.body.dataset.ready = 'true';

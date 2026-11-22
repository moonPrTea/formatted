export function enhanceNumbers(root: ParentNode) {
  for (const input of root.querySelectorAll<HTMLInputElement>(
    'input[type=number]',
  )) {
    const label = input.closest('label')!;
    const name = label.firstChild!.textContent!.trim();
    input.id ||= `${input.form!.id}-${input.name}`;
    label.htmlFor = input.id;
    const field = document.createElement('span');
    field.className = 'number-control';
    input.before(field);
    field.append(input);
    const buttons = [-1, 1].map(direction => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'number-step';
      button.dataset.step = String(direction);
      button.setAttribute(
        'aria-label',
        `${direction < 0 ? 'Уменьшить' : 'Увеличить'}: ${name.toLocaleLowerCase()}`,
      );
      button.setAttribute('aria-controls', input.id);
      button.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M5 10h10${direction > 0 ? 'M10 5v10' : ''}"/></svg>`;
      button.addEventListener('click', () => {
        if (!Number.isFinite(input.valueAsNumber))
          input.value = input.min || '0';
        else if (direction > 0) input.stepUp();
        else input.stepDown();
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
      });
      field.append(button);
      return button;
    });
    const sync = () =>
      buttons.forEach((button, index) => {
        const limit = index === 0 ? input.min : input.max;
        button.disabled =
          input.disabled ||
          input.readOnly ||
          (limit !== '' &&
            Number.isFinite(input.valueAsNumber) &&
            (index === 0
              ? input.valueAsNumber <= Number(limit)
              : input.valueAsNumber >= Number(limit)));
      });
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  }
}

import {useEffect, useRef, useState} from 'react';
import {Label, ListBox, Select} from '@heroui/react';
import {flushSync} from 'react-dom';

export interface SelectControlProps {
  select: HTMLSelectElement;
  label: string;
  id: string;
  registerClose(close: () => void): void;
}

export function SelectControl({
  select,
  label,
  id,
  registerClose,
}: SelectControlProps) {
  const [value, setValue] = useState(select.value);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || list.contains(document.activeElement)) return;
      const item =
        list.querySelector<HTMLElement>('[role=option][aria-selected=true]') ??
        list.querySelector<HTMLElement>(
          '[role=option]:not([aria-disabled=true])',
        );
      (item ?? list).focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const [options, setOptions] = useState([...select.options]);
  const [disabled, setDisabled] = useState(select.disabled);
  useEffect(() => {
    registerClose(() => setOpen(false));
    const sync = () => {
      setValue(select.value);
      setOptions([...select.options]);
      setDisabled(select.disabled);
    };
    const observer = new MutationObserver(sync);
    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    select.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      select.removeEventListener('change', sync);
    };
  }, [select, registerClose]);

  return (
    <Select
      aria-label={label}
      value={value}
      isOpen={open}
      onOpenChange={setOpen}
      isDisabled={disabled}
      fullWidth
      onChange={next => {
        const selected = String(next ?? '');
        setValue(selected);
        if (select.value === selected) return;
        select.value = selected;
        queueMicrotask(() =>
          select.dispatchEvent(new Event('change', {bubbles: true})),
        );
      }}
    >
      <Select.Trigger
        id={id}
        className="select-trigger"
        data-select-name={select.name}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="select-menu" shouldSkipAnimation>
        <div
          onKeyDownCapture={event => {
            if (event.key !== 'Tab') return;
            flushSync(() => setOpen(false));
            document.getElementById(id)?.focus({preventScroll: true});
          }}
        >
          <ListBox ref={listRef} className="select-options" aria-label={label}>
            {options.map(option => (
              <ListBox.Item
                id={option.value}
                key={option.value}
                textValue={option.text}
                isDisabled={option.disabled}
                className="select-option"
              >
                <Label>{option.text}</Label>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </div>
      </Select.Popover>
    </Select>
  );
}

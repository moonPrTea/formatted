import {useEffect, useState} from 'react';
import {Button, Dropdown, Input, Label} from '@heroui/react';
import {buttonVariants} from '@heroui/styles';
import {Check, ChevronDown, FunctionSquare, X} from 'lucide-react';

export function SheetsShell() {
  const [language, setLanguage] = useState(document.documentElement.lang);
  const english = language === 'en';

  const [openMenu, setOpenMenu] = useState<'file' | 'range' | null>(null);
  useEffect(() => {
    if (!openMenu) return;
    const frame = requestAnimationFrame(() => {
      const menu = document.querySelector(`[data-sheet-menu="${openMenu}"]`);
      if (menu?.contains(document.activeElement)) return;
      menu
        ?.querySelector<HTMLElement>(
          '[role=menuitem]:not([aria-disabled=true])',
        )
        ?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [openMenu]);
  const changeMenu = (menu: 'file' | 'range', isOpen: boolean) =>
    setOpenMenu(current => {
      if (isOpen) return menu;
      return current === menu ? null : current;
    });

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setLanguage(document.documentElement.lang),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
    return () => observer.disconnect();
  }, []);
  const runCommand = (commandId: string | number) =>
    document
      .getElementById(String(commandId).replace(/^command-/, ''))
      ?.click();

  return (
    <div id="sheets-app">
      <header>
        <img src="../assets/forma.svg" width="24" height="24" alt="" />
        <strong id="title" />
        <div className="sheet-header-actions">
          <Button variant="ghost" id="undo" data-label="undo" />
          <details id="options">
            <summary
              className={buttonVariants({
                variant: 'ghost',
                className: 'sheet-service',
              })}
            >
              <span data-label="options" />
              <ChevronDown />
            </summary>
            <div className="options">
              <span data-label="language" />
              <Button variant="ghost" data-language="ru" lang="ru">
                Русский
              </Button>
              <Button variant="ghost" data-language="en" lang="en">
                English
              </Button>
            </div>
          </details>
        </div>
      </header>
      <div
        className="toolbar"
        role="toolbar"
        aria-label={english ? 'Workbook' : 'Книга'}
      >
        <Dropdown
          isOpen={openMenu === 'file'}
          onOpenChange={isOpen => changeMenu('file', isOpen)}
        >
          <Dropdown.Trigger className={buttonVariants({variant: 'ghost'})}>
            {english ? 'File' : 'Файл'}
            <ChevronDown />
          </Dropdown.Trigger>
          <Dropdown.Popover shouldSkipAnimation>
            <Dropdown.Menu
              data-sheet-menu="file"
              autoFocus="first"
              onAction={runCommand}
              aria-label={english ? 'File' : 'Файл'}
            >
              <Dropdown.Item id="command-file-open">
                <Label>{english ? 'Open' : 'Открыть'}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="command-file-save">
                <Label>{english ? 'Save' : 'Сохранить'}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="command-file-save-as">
                <Label>{english ? 'Save as' : 'Сохранить как'}</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <Dropdown
          isOpen={openMenu === 'range'}
          onOpenChange={isOpen => changeMenu('range', isOpen)}
        >
          <Dropdown.Trigger className={buttonVariants({variant: 'ghost'})}>
            {english ? 'Range' : 'Диапазон'}
            <ChevronDown />
          </Dropdown.Trigger>
          <Dropdown.Popover shouldSkipAnimation>
            <Dropdown.Menu
              data-sheet-menu="range"
              autoFocus="first"
              onAction={runCommand}
              aria-label={english ? 'Range' : 'Диапазон'}
            >
              <Dropdown.Item id="command-range-fill">
                <Label>{english ? 'Fill range' : 'Заполнить диапазон'}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="command-range-values">
                <Label>{english ? 'Paste values' : 'Вставить значения'}</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <div hidden>
          <button id="file-open" data-label="open" />
          <button id="file-save" data-label="save" />
          <button id="file-save-as" data-label="saveAs" />
          <button id="range-fill" data-label="fill" />
          <button id="range-values" data-label="values" />
        </div>
      </div>
      <form id="formula-bar" autoComplete="off">
        <Input
          id="address"
          aria-label={english ? 'Cell address' : 'Адрес ячейки'}
          maxLength={10}
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          isIconOnly
          id="function-wizard"
          aria-label="Мастер функций"
        >
          <FunctionSquare />
        </Button>
        <Input
          id="formula"
          aria-label="Строка формул"
          maxLength={32767}
          spellCheck={false}
        />
        <Button
          type="submit"
          variant="ghost"
          isIconOnly
          aria-label={english ? 'Apply' : 'Применить'}
        >
          <Check />
        </Button>
        <Button
          type="button"
          variant="ghost"
          isIconOnly
          id="cancel"
          aria-label={english ? 'Cancel' : 'Отменить'}
        >
          <X />
        </Button>
      </form>
      <div id="grid-scroll">
        <table id="grid" role="grid" aria-label="Таблица" />
      </div>
      <nav id="sheets" aria-label="Листы" />
      <dialog id="sheet-dialog" aria-labelledby="sheet-dialog-title">
        <form id="sheet-action">
          <h2 id="sheet-dialog-title" />
          <p id="sheet-dialog-detail" />
          <label id="sheet-name-label" htmlFor="sheet-name" />
          <Input
            id="sheet-name"
            maxLength={100}
            autoComplete="off"
            aria-describedby="sheet-dialog-error"
          />
          <p id="sheet-dialog-error" role="alert" />
          <div className="dialog-actions">
            <Button type="button" variant="tertiary" id="sheet-dialog-cancel" />
            <Button type="submit" id="sheet-dialog-apply" />
          </div>
        </form>
      </dialog>
      <footer className="sheet-status" hidden>
        <span id="recovery" role="status" />
        <span id="selection" hidden />
        <output id="status" aria-live="polite" />
      </footer>
    </div>
  );
}

import {useEffect, useState} from 'react';
import {Button, Modal} from '@heroui/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  Clock3,
  ChevronDown,
  Code2,
  Database,
  House,
  PanelLeft,
  Settings2,
  Table2,
  Zap,
} from 'lucide-react';
import {ActionButton} from './action-button.js';
import {Dashboard} from './dashboard.js';
import {DatabaseWorkspace} from './database-workspace.js';
import {ThemePicker} from './theme-picker.js';
import type {ShellProps} from '../shell-types.js';

const navigation = [
  {id: 'home', title: 'Главная', icon: House},
  {id: 'generator', title: 'Данные', icon: Database},
  {id: 'database', title: 'SQL', icon: Code2},
  {id: 'lesson', title: 'Практика Calc', icon: BookOpen},
  {id: 'quiz', title: 'Блиц', icon: Zap},
  {id: 'practice', title: 'На время', icon: Clock3},
  {id: 'history', title: 'Прогресс', icon: ChartNoAxesCombined},
] as const;
const navigationGroups = [
  {title: 'Практика', views: ['generator', 'database', 'practice']},
  {title: 'Обучение', views: ['lesson', 'quiz']},
];

export function AppShell(props: ShellProps & {contentKey: number}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  useEffect(() => {
    const confirm = (event: Event) =>
      setConfirmationOpen((event as CustomEvent<boolean>).detail);
    document.addEventListener('formatted-confirm', confirm);
    return () => document.removeEventListener('formatted-confirm', confirm);
  }, []);

  return (
    <>
      <header className={`window-bar platform-${props.platform}`}>
        <div className="window-navigation">
          <ActionButton
            variant="ghost"
            isIconOnly
            data-action="toggle-sidebar"
            aria-label="Боковая панель"
            aria-expanded={!props.sidebarCollapsed}
          >
            <PanelLeft />
          </ActionButton>
          <ActionButton
            variant="ghost"
            isIconOnly
            data-action="nav-back"
            aria-label="Назад"
            isDisabled={!props.canGoBack}
          >
            <ArrowLeft />
          </ActionButton>
          <ActionButton
            variant="ghost"
            isIconOnly
            data-action="nav-forward"
            aria-label="Вперёд"
            isDisabled={!props.canGoForward}
          >
            <ArrowRight />
          </ActionButton>
        </div>
        <div className="window-title">
          <span>formatted</span>
          <strong>{props.title}</strong>
        </div>
        <div className="window-status">
          {props.timer && (
            <ActionButton variant="secondary" data-view="practice">
              <Clock3 />
              <span data-clock="">{props.timer}</span>
            </ActionButton>
          )}
          <Button
            variant="ghost"
            isIconOnly
            aria-label="Настройки"
            onPress={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </div>
      </header>
      <div
        className={`layout ${props.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      >
        <aside className="sidebar" aria-label="Навигация">
          <a href="#home" className="wordmark">
            <img src="assets/forma.svg" className="brand-logo" alt="" />
            formatted
          </a>
          <nav aria-label="Разделы приложения">
            {navigation
              .filter(item => ['home', 'history'].includes(item.id))
              .map(({id, title, icon: Icon}) => (
                <ActionButton
                  key={id}
                  variant={props.view === id ? 'secondary' : 'ghost'}
                  data-view={id}
                  aria-current={props.view === id ? 'page' : undefined}
                  className={`nav-item ${props.view === id ? 'selected' : ''}`}
                >
                  <Icon />
                  <span>{title}</span>
                </ActionButton>
              ))}
            {navigationGroups.map(group => (
              <div className="nav-group" key={group.title}>
                <Button
                  variant="ghost"
                  className="nav-group-heading"
                  aria-expanded={!collapsedGroups.includes(group.title)}
                  onPress={() =>
                    setCollapsedGroups(previous =>
                      previous.includes(group.title)
                        ? previous.filter(title => title !== group.title)
                        : [...previous, group.title],
                    )
                  }
                >
                  {group.title}
                  <ChevronDown />
                </Button>
                <div
                  className="nav-group-items"
                  hidden={collapsedGroups.includes(group.title)}
                >
                  {navigation
                    .filter(item => group.views.includes(item.id))
                    .map(({id, title, icon: Icon}) => (
                      <ActionButton
                        key={id}
                        variant={props.view === id ? 'secondary' : 'ghost'}
                        data-view={id}
                        aria-current={props.view === id ? 'page' : undefined}
                        className={`nav-item ${props.view === id ? 'selected' : ''}`}
                      >
                        <Icon />
                        <span>{title}</span>
                      </ActionButton>
                    ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="sidebar-apps">
            <ActionButton
              variant="ghost"
              data-action="open-sheets"
              isDisabled={!props.canOpenSheets}
            >
              <Table2 />
              Таблицы
            </ActionButton>
          </div>
          <Button
            variant="ghost"
            className="sidebar-settings"
            onPress={() => setSettingsOpen(true)}
          >
            <Settings2 />
            Настройки
          </Button>
        </aside>
        <aside className="rail" aria-label="Свернутая навигация">
          {navigation.map(({id, title, icon: Icon}) => (
            <ActionButton
              key={id}
              variant={props.view === id ? 'secondary' : 'ghost'}
              isIconOnly
              data-view={id}
              aria-label={title}
              aria-current={props.view === id ? 'page' : undefined}
            >
              <Icon />
            </ActionButton>
          ))}
          <ActionButton
            variant="ghost"
            isIconOnly
            data-action="open-sheets"
            aria-label="Таблицы"
            isDisabled={!props.canOpenSheets}
          >
            <Table2 />
          </ActionButton>
        </aside>
        <div className="main-shell">
          <main id="main" tabIndex={-1} data-screen={props.view}>
            {props.warning && (
              <div className="notice" role="alert">
                {props.warning}
              </div>
            )}
            {props.view === 'home' ? (
              <Dashboard
                summary={props.dashboard}
                canOpenSheets={props.canOpenSheets}
              />
            ) : props.view === 'database' ? (
              <DatabaseWorkspace />
            ) : (
              <div
                key={props.contentKey}
                className="screen-content"
                dangerouslySetInnerHTML={{__html: props.content}}
              />
            )}
          </main>
        </div>
      </div>
      <Modal isOpen={settingsOpen} onOpenChange={setSettingsOpen}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Настройки</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <ThemePicker />
                <div
                  className="settings-content"
                  onClick={event => {
                    const target =
                      event.target instanceof Element
                        ? event.target.closest<HTMLButtonElement>(
                            '[data-action]',
                          )
                        : null;
                    if (!target || target.disabled) return;
                    event.stopPropagation();
                    target.dispatchEvent(
                      new Event('formatted-action', {bubbles: true}),
                    );
                  }}
                  dangerouslySetInnerHTML={{__html: props.environment}}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal isOpen={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog id="confirm-dialog">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Завершить попытку?</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p>Ответы будут сохранены. Продолжить попытку будет нельзя.</p>
              </Modal.Body>
              <Modal.Footer>
                <ActionButton variant="tertiary" data-action="cancel-finish">
                  Продолжить работу
                </ActionButton>
                <ActionButton data-action="confirm-finish">
                  Завершить
                </ActionButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}

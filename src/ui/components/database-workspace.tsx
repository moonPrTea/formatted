import {useState} from 'react';
import {Button, Card, Label, Tabs, TextArea} from '@heroui/react';
import {Check, Download, Info} from 'lucide-react';
import {
  databaseSteps,
  readDatabaseProgress,
  type DatabaseProgress,
} from '../../core/database-lesson.js';

const storageKey = 'formatted.database.v1';

function loadProgress() {
  try {
    return {
      progress: readDatabaseProgress(
        JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
      ),
      error: '',
    };
  } catch {
    return {
      progress: readDatabaseProgress(null),
      error: 'Не удалось прочитать прошлые черновики',
    };
  }
}

export function DatabaseWorkspace() {
  const [state, setState] = useState(loadProgress);
  const [tab, setTab] = useState('task');
  const {progress, error} = state;
  const index = progress.step;
  const step = databaseSteps[index];
  const answer = progress.answers[index];
  const correct = progress.answers.filter(
    (value, i) => value === databaseSteps[i].correct,
  ).length;

  function update(next: DatabaseProgress) {
    let error = '';
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      error = 'Не удалось сохранить черновик. Скачай SQL до закрытия окна';
    }
    setState({progress: next, error});
  }

  function move(next: number) {
    update({...progress, step: next});
    requestAnimationFrame(() => {
      document.getElementById('database-title')?.focus({preventScroll: true});
    });
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([progress.drafts[index]], {type: 'text/plain;charset=utf-8'}),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `module-02-step-${index + 1}.sql`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section id="database-lesson" className="sql-workspace">
      <header className="page-heading">
        <div>
          <h1>Базы данных</h1>
          <p>Практика PostgreSQL</p>
        </div>
        <details className="sql-about">
          <summary>
            <Info />О практикуме
          </summary>
          <p>
            Практикум на двух таблицах. Нормализация 12 таблиц остаётся
            отдельным заданием. Выполняй SQL в pgAdmin: здесь сохраняются
            черновики и проверяются ответы на вопросы.
          </p>
        </details>
      </header>
      <div className="sql-layout">
        <nav
          id="database-steps"
          className="sql-steps"
          aria-label="Этапы PostgreSQL"
        >
          <p className="sql-section-label">Содержание</p>
          {databaseSteps.map((item, i) => (
            <Button
              key={item.title}
              variant={index === i ? 'secondary' : 'ghost'}
              className="sql-step"
              data-db-step={i}
              aria-current={index === i ? 'step' : undefined}
              onPress={() => move(i)}
            >
              <span className="sql-step-number">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{item.title}</span>
              {progress.answers[i] === item.correct && (
                <Check className="sql-step-check" />
              )}
            </Button>
          ))}
        </nav>
        <Card id="database-content" className="sql-editor">
          <Card.Header>
            <p className="sql-section-label">
              Шаг {index + 1} из {databaseSteps.length}
            </p>
            <Card.Title id="database-title" tabIndex={-1}>
              {step.title}
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <Tabs
              className="sql-tabs"
              data-workspace="database"
              selectedKey={tab}
              onSelectionChange={value => setTab(String(value))}
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="Разделы практикума">
                  {[
                    ['task', 'Задание'],
                    ['query', 'SQL'],
                    ['check', 'Проверка'],
                  ].map(([value, title]) => (
                    <Tabs.Tab key={value} id={value} data-ui-value={value}>
                      {title}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="task" shouldForceMount>
                <div className="sql-task" data-section="task">
                  <p className="sql-goal">{step.goal}</p>
                  <ol className="sql-tasks">
                    {step.tasks.map(task => (
                      <li key={task}>{task}</li>
                    ))}
                  </ol>
                  <details className="sql-hint">
                    <summary>Подсказка</summary>
                    <p>{step.hint}</p>
                  </details>
                  <p className="sql-source">Справочник: {step.source}</p>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="query" shouldForceMount>
                <div className="sql-query" data-section="query">
                  <Label htmlFor="database-sql">Твой SQL</Label>
                  <TextArea
                    key={index}
                    id="database-sql"
                    rows={12}
                    maxLength={50000}
                    spellCheck={false}
                    fullWidth
                    defaultValue={progress.drafts[index]}
                    placeholder="Напиши команды самостоятельно"
                    onInput={event => {
                      const drafts = [...progress.drafts];
                      drafts[index] = event.currentTarget.value;
                      update({...progress, drafts});
                    }}
                  />
                  <Button
                    variant="secondary"
                    id="database-download"
                    onPress={download}
                  >
                    <Download />
                    Скачать SQL
                  </Button>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="check" shouldForceMount>
                <div className="sql-check" data-section="check">
                  <fieldset>
                    <legend>{step.question}</legend>
                    {step.answers.map((text, i) => (
                      <label key={text}>
                        <input
                          type="radio"
                          name="db-answer"
                          value={i}
                          checked={answer === i}
                          onChange={() => {
                            const answers = [...progress.answers];
                            answers[index] = i;
                            update({...progress, answers});
                          }}
                        />
                        <span>{text}</span>
                      </label>
                    ))}
                  </fieldset>
                  <p id="database-feedback" role="status">
                    {answer === null
                      ? 'Проверяется понимание, не выполнение SQL'
                      : `${answer === step.correct ? 'Верно' : 'Попробуй ещё раз'}. ${step.explanation}`}
                  </p>
                </div>
              </Tabs.Panel>
            </Tabs>
          </Card.Content>
          <Card.Footer className="sql-footer">
            <Button
              variant="ghost"
              id="database-prev"
              isDisabled={index === 0}
              onPress={() => move(index - 1)}
            >
              Назад
            </Button>
            <span>
              Ответов верно: {correct} из {databaseSteps.length}
            </span>
            <Button
              id="database-next"
              isDisabled={index === databaseSteps.length - 1}
              onPress={() => move(index + 1)}
            >
              Далее
            </Button>
          </Card.Footer>
        </Card>
      </div>
      <p id="database-storage" role="status" hidden={!error}>
        {error}
      </p>
    </section>
  );
}

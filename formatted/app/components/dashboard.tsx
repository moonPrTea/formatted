import {domains} from '../../../packages/practice/src/generator.js';
import {Card} from '@heroui/react';
import {BookOpen, Code2, Database, Table2, Zap} from 'lucide-react';
import {ActionButton} from '../../../packages/ui/components/action-button.js';
import type {DashboardSummary} from '../types/shell.js';

export function Dashboard({
  summary,
  canOpenSheets,
}: {
  summary: DashboardSummary;
  canOpenSheets: boolean;
}) {
  return (
    <div className="dashboard-page">
      <header className="page-heading">
        <div>
          <h1>Главная</h1>
          <p>Выбери направление практики</p>
        </div>
      </header>
      <section aria-labelledby="practice-title">
        <h2 id="practice-title" className="section-title">
          Практика
        </h2>
        <div className="dashboard-modules">
          <Card>
            <Card.Header>
              <span className="featured-icon">
                <Database />
              </span>
              <Card.Title>Данные</Card.Title>
              <Card.Description>CSV и нормализация</Card.Description>
            </Card.Header>
            <Card.Footer>
              <ActionButton fullWidth data-view="generator">
                Создать вариант
              </ActionButton>
            </Card.Footer>
          </Card>
          <Card>
            <Card.Header>
              <span className="featured-icon">
                <Code2 />
              </span>
              <Card.Title>SQL</Card.Title>
              <Card.Description>Практика PostgreSQL</Card.Description>
            </Card.Header>
            <Card.Footer>
              <ActionButton fullWidth variant="secondary" data-view="database">
                Продолжить
              </ActionButton>
            </Card.Footer>
          </Card>
          <Card>
            <Card.Header>
              <span className="featured-icon">
                <Table2 />
              </span>
              <Card.Title>Таблицы</Card.Title>
              <Card.Description>Книги и формулы</Card.Description>
            </Card.Header>
            <Card.Footer>
              <ActionButton
                fullWidth
                variant="secondary"
                data-action="open-sheets"
                isDisabled={!canOpenSheets}
              >
                Открыть редактор
              </ActionButton>
            </Card.Footer>
          </Card>
        </div>
      </section>
      <section aria-labelledby="learning-title">
        <h2 id="learning-title" className="section-title">
          Обучение
        </h2>
        <Card className="learning-card">
          <Card.Content>
            <div className="learning-row">
              <BookOpen />
              <strong>Практика Calc</strong>
              <span>7 шагов</span>
              <ActionButton variant="ghost" data-view="lesson">
                Продолжить
              </ActionButton>
            </div>
            <div className="learning-row">
              <Zap />
              <strong>Блиц</strong>
              <span>8 вопросов</span>
              <ActionButton variant="secondary" data-view="quiz">
                Начать
              </ActionButton>
            </div>
          </Card.Content>
        </Card>
      </section>
      <section aria-labelledby="domains-title">
        <h2 id="domains-title" className="section-title">
          Быстрый вариант
        </h2>
        <div className="domain-shortcuts">
          {domains.map(domain => (
            <ActionButton
              key={domain.id}
              variant="secondary"
              data-action="domain"
              data-domain={domain.id}
            >
              {domain.name}
            </ActionButton>
          ))}
        </div>
      </section>
      <section aria-labelledby="history-title">
        <div className="section-heading">
          <h2 id="history-title">Последние попытки</h2>
          <ActionButton variant="ghost" data-view="history">
            Вся история
          </ActionButton>
        </div>
        <div dangerouslySetInnerHTML={{__html: summary.history}} />
      </section>
    </div>
  );
}

![formatted](docs/banner.png)

# formatted

[English](README.md)

Приложение для изучения нормализации данных, табличных формул и SQL.

## Запуск

Нужен Node.js 22.12+.

```sh
npm ci
npm start
```

Дополнительно:

- Python 3.9+ и LibreOffice для практики во внешнем Calc
- PostgreSQL и pgAdmin для выполнения SQL
- Ollama с `qwen3:4b-instruct` для локальных AI-тем; модель скачивается из настроек генератора

AI предлагает названия и описание задания внутри готовой модели данных. API-ключ не нужен; установка и первая загрузка модели требуют интернета. Для повторения AI-варианта сохраняй `variant.json`.

## Разработка

TypeScript, Electron, Google gts. Логика заданий находится в `src/core`. Редактор Sheets, его Electron-часть и тесты находятся в `sheets`, общий табличный движок — в `packages/spreadsheet/src`. Electron-часть основного приложения остаётся в `electron`.

| Команда                | Назначение                  |
| ---------------------- | --------------------------- |
| `npm run check`        | Типы, стиль и тесты логики  |
| `npm run test:sheets`  | Сценарии редактора таблиц   |
| `npm run test:desktop` | Сценарии desktop-приложения |
| `npm run package`      | Сборка для текущей ОС       |

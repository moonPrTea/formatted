![formatted](docs/banner.png)

# formatted

[Русская версия](README.ru.md)

A desktop app for learning data normalization, spreadsheet formulas and SQL.

## Run

Requires Node.js 22.12+.

```sh
npm ci
npm start
```

Optional tools:

- Python 3.9+ and LibreOffice for the external Calc walkthrough
- PostgreSQL and pgAdmin for SQL practice
- Ollama with `qwen3:4b-instruct` for local AI themes; download the model from the generator's setup section

AI suggests names and an assignment description within an existing data model. It needs no API key; installation and the initial model download require internet. Keep `variant.json` to reproduce an AI variant.

## Development

TypeScript, Electron, Google gts.

| Folder      | Contents                                                        |
| ----------- | --------------------------------------------------------------- |
| `formatted` | Main app, Electron integration, Calc tools and tests            |
| `sheets`    | Spreadsheet editor, Electron integration and tests              |
| `packages`  | Shared UI, practice data, types and spreadsheet engine          |
| `studio`    | Studio interface modules, Electron bridge, C# service and tests |

| Command                | Purpose                     |
| ---------------------- | --------------------------- |
| `npm run check`        | Types, lint and logic tests |
| `npm run test:sheets`  | Table editor workflows      |
| `npm run test:desktop` | Desktop workflows           |
| `npm run package`      | Build for the current OS    |

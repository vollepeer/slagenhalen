# Repository Guidelines

## Project Structure & Module Organization
- `docs/specs.md` contains the product specification, data model, and acceptance tests. Treat it as the source of truth for business rules and UI language (Dutch).
- No application source tree is committed yet. When adding code, keep server, client, and database concerns separated (for example: `server/`, `client/`, `db/`).
- Store local assets under a dedicated folder (for example: `client/assets/`) to keep UI resources discoverable.

## Build, Test, and Development Commands
- There are no build or run scripts defined in this repository yet.
- When you add tooling, document the exact commands here (for example: `npm run dev`, `npm test`, `make migrate`). Keep them runnable offline.

## Coding Style & Naming Conventions
- Follow Dutch UI copy in all user-facing strings as mandated in `docs/specs.md`.
- Prefer clear, descriptive names for business entities: `season`, `event`, `participant`, `rank`.
- Use consistent casing per language (for example: `camelCase` in JS/TS, `snake_case` for SQL columns).
- If you introduce formatters or linters (for example: Prettier, ESLint), add their commands and config paths to this guide.

## Testing Guidelines
- The acceptance tests listed in `docs/specs.md` define required behavior.
- When implementing tests, mirror those scenarios and name tests after the behavior (for example: `locks_event_when_scores_complete`).
- Document the test runner and how to execute unit and integration tests once added.

## Commit & Pull Request Guidelines
- There is no commit history yet, so no established convention.
- Use clear, imperative commit messages (for example: "Add event lock validation").
- For pull requests, include:
  - A short summary of changes.
  - Any relevant screenshots for UI changes.
  - Notes on how to verify locally.

## Security & Configuration Tips
- The app must run fully offline and use browser storage for persistence.
- Do not introduce runtime CDN dependencies; bundle assets locally.
- Keep configuration local and explicit when needed.

# Goal: Dark mode AAA contrast

Raise HermesHub dark-mode readability to WCAG 2.1 AAA across the entire app by retuning CSS tokens in `src/styles.css`, migrating hardcoded alert/input colors to semantic tokens, and adding an automated contrast guard — without changing light mode or theme-toggle behavior.

## Shared understanding

See [facts.md](./facts.md) for scope, contrast bar, exclusions, and verification expectations.

## Execution plan

See [plan.md](./plan.md) for the token-first approach, file sweep order, and per-step checks.

## Done when

- All facts in `facts.md` are satisfied.
- `src/lib/dark-mode-contrast.test.ts` passes for dark-mode token and component pairs.
- Manual dark-mode spot-check on landing, login, dashboard, servers, providers, Telegram, logs, and settings is complete.
- `just ci` passes.

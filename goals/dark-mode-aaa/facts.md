# Dark mode AAA — facts

- Dark mode applies via `data-theme="dark"` and `prefers-color-scheme: dark` tokens in `src/styles.css`.
- Scope covers the whole app: landing, login, authenticated routes, and shared shell/components.
- Light mode is out of primary scope; fix light tokens only if the audit finds failing pairs while working on dark.
- Primary goal is readability in dark mode; a brighter, crisper dark UI is acceptable over preserving the current soft/hazy look.
- Lagoon/teal brand accents stay recognizable after retuning.
- All visible text in dark mode meets WCAG 2.1 AAA: 7:1 for normal text, 4.5:1 for large text (≥18pt regular or ≥14pt bold).
- Helper/secondary copy is not exempt — strict AAA applies to body, labels, hints, kickers, and metadata text too.
- Interactive affordances in dark mode meet AAA for their text/icons against their immediate background: buttons, links, tabs, chips, inputs, focus rings, and selected states.
- Status pills (success, warning, error) meet AAA for text/icon against pill background in dark mode.
- Decorative page gradients may stay atmospheric if they do not reduce text contrast on surfaces where text sits.
- Token retune in `src/styles.css` is the first fix layer (`--sea-ink`, `--sea-ink-soft`, surfaces, chips, lines, kickers, header, status pill dark overrides).
- After tokens, sweep outlier hardcoded colors and `dark:` Tailwind classes to tokens or AAA-safe pairs (known outliers: `status-overview.tsx`, `login-page.tsx`).
- Theme toggle behavior (light / dark / auto) does not change.
- Automated test validates dark-mode token contrast pairs against WCAG AAA thresholds.
- Manual spot-check confirms readability on dashboard, providers, settings, servers, telegram, logs, landing, and login in dark mode.
- `just ci` passes after changes.

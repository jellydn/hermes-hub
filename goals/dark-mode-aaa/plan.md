# Dark mode AAA — plan

## Solution approach

Retune dark-mode CSS custom properties in `src/styles.css` first so the lagoon/sea palette reads brighter and crisper while every semantic text/background pair meets WCAG 2.1 AAA (7:1 normal, 4.5:1 large). Add a small set of dark-aware semantic tokens for alerts, inputs, and focus so components stop relying on light-mode Tailwind hues (`text-red-600`, `bg-white/80`, etc.). Then sweep the ~30 feature files with hardcoded status/input colors to use those tokens or shared UI primitives. Lock regressions with a Vitest contrast audit over dark token pairs and finish with a manual dark-mode pass across major routes.

Light mode tokens stay unchanged unless a shared component change accidentally breaks a light pair (fix only if the audit flags it).

## Ordered steps

### 1. Baseline audit and contrast harness

**Files:** new `src/lib/wcag-contrast.ts`, new `src/lib/dark-mode-contrast.test.ts`, read `src/styles.css`.

- Implement relative-luminance + contrast-ratio helpers (pure TypeScript, no new dependency).
- Export a dark token map mirroring `:root[data-theme="dark"]` values from `src/styles.css`, including rgba surfaces composited over `--bg-base` for realistic backgrounds.
- Define the canonical pair matrix: body text (`--sea-ink`, `--sea-ink-soft`, `--kicker`) on `--surface-strong`, `--chip-bg`, `--foam`, `--bg-base`; links (`--lagoon-deep`) on surfaces; nav/ghost hover text; status-pill text on pill backgrounds; focus ring (`--lagoon`) against `--foam` ring-offset.
- Run the harness against current tokens to produce a failing checklist that drives step 2 retunes.

**Verify:** `bun run test src/lib/dark-mode-contrast.test.ts` (expect failures before retune; document which pairs fail).

### 2. Retune dark semantic tokens

**Files:** `src/styles.css`.

- Brighten `--sea-ink-soft` and, if needed, `--sea-ink` so secondary copy clears 7:1 on all dark surfaces.
- Adjust `--lagoon` / `--lagoon-deep` only as needed for link and CTA text contrast; keep hues recognizably lagoon/teal.
- Raise `--surface`, `--surface-strong`, `--chip-bg`, and `--line` separation so text does not sit on muddy translucent stacks.
- Add dark semantic tokens (names TBD during implementation, e.g. `--alert-error-fg`, `--alert-error-bg`, `--alert-warning-fg`, `--alert-warning-bg`, `--alert-success-fg`, `--alert-success-bg`, `--input-bg`, `--focus-ring`, `--focus-ring-offset`) with light-mode equivalents where shared components need them.
- Retune existing `.status-pill--warning` / `.status-pill--error` dark overrides and add dark success pill override if `--palm` on its mix fails AAA.
- Keep decorative `body` gradients; ensure text-bearing surfaces (`island-shell`, `feature-card`, inputs) use opaque enough backgrounds that contrast is stable.

**Verify:** `bun run test src/lib/dark-mode-contrast.test.ts` passes for all token pairs; quick visual check in browser with `data-theme="dark"`.

### 3. Centralize interactive and status styling

**Files:** `src/components/ui/button-variants.ts`, `src/components/ui/status-icon.tsx`, `src/components/ui/banner.tsx`, `src/styles.css` (pill classes).

- Point `button` variants (especially `destructive`, `default`, `ghost`, focus ring/offset) at semantic tokens instead of fixed Tailwind reds and rgba literals.
- Replace `StatusIcon` `text-red-600` / `text-amber-600` / etc. with semantic alert tokens.
- Extend `Banner` tones to use the same alert surface + foreground tokens (not `text-[var(--sea-ink)]` on tinted washes).
- Prefer reusing `.status-pill--*` classes or shared alert utility classes for inline warning/error blocks.

**Verify:** contrast test covers button and banner pairs; `bun run test` green.

### 4. Sweep hardcoded feature colors

**Files (grouped by domain):**

- **Dashboard / auth:** `src/features/dashboard/status-overview.tsx`, `src/features/auth/login-page.tsx`
- **Providers:** `provider-settings-aside.tsx`, `provider-settings-ui.tsx`, `provider-selection-panel.tsx`, `provider-access-tabs.tsx`, `subscription-selection-panel.tsx`, `codex-auth-panel.tsx`, `codex-auth-panel-ui.tsx`
- **Servers:** `server-detail.tsx`, `server-basics-form.tsx`, `server-action-controls.tsx`, `new-server-page.tsx`, `install-progress.tsx`, `install-log-card.tsx`, `delete-server-dialog.tsx`, `connection-wizard-types.ts`, `connection-wizard-auth-card.tsx`
- **Telegram:** `telegram-input-class.ts`, `telegram-test-section.tsx`, `telegram-pairing-section.tsx`, `telegram-deploy-section.tsx`, `telegram-connect-section.tsx`, `telegram-sidebar.tsx`
- **Settings / logs:** `persona-settings.tsx`, `mcp-form-message.tsx`, `hermes-deploy-panel.tsx`, `skills-deploy-aside.tsx`, `skill-list-item.tsx`, `skill-form.tsx`, `logs-viewer.tsx`

Changes per file:

- Replace `text-red-600`, `text-amber-600/700`, `text-emerald-600`, `dark:text-*` one-offs with semantic tokens or `Banner` / `StatusIcon`.
- Replace `bg-white/70`, `bg-white/80`, `bg-white/60`, `bg-white/10` inputs and chips with `--input-bg` or `--chip-bg`.
- Remove the few remaining `dark:` Tailwind classes once tokens handle both schemes.
- Keep layout/spacing classes untouched.

**Verify:** `rg 'text-red-|text-amber-|text-emerald-|dark:' src/` returns only intentional token definitions or comments; `bun run test` and `bun run typecheck`.

### 5. Focus rings and selected states

**Files:** `src/styles.css` (`:focus-visible`), `src/components/ui/button-variants.ts`, shared input class strings (`telegram-input-class.ts`, server wizard field patterns), `src/features/settings/settings-page.tsx` (selected tab uses `bg-[var(--sea-ink)] text-white`).

- Ensure focus ring color vs ring-offset background meets 3:1 UI component contrast and is visible on dark surfaces.
- Audit selected tab/chip states: white-on-sea-ink in dark mode must still meet AAA (may need `--sea-ink` lightened for dark selected fg/bg pair).

**Verify:** contrast test includes focus and selected-state pairs; keyboard spot-check on login input and dashboard nav.

### 6. Manual route verification and CI

**Files:** none (verification only).

- Manual dark-mode pass: landing, login, dashboard, servers list/detail/install, AI provider, Telegram, logs, settings (all tabs), about.
- Toggle theme light → dark → auto; confirm no flash of failing contrast on hydration.
- Run full CI gate.

**Verify:** `just ci` passes; manual checklist complete.

## Risks and open questions

- **Translucent surfaces:** rgba `--surface` / `--chip-bg` composited over gradients may differ slightly from computed test backgrounds; prefer slightly higher opacity or solid mixes if spot-check disagrees with the harness.
- **Brand vs AAA on primary buttons:** lagoon tinted button backgrounds may force darker/lighter label text than today; keep hue, adjust luminance only as needed.
- **Scope creep:** ~30 files with alert/input hardcoding — batch by domain and reuse `Banner`/`StatusIcon` to limit bespoke classes.
- **No visual regression suite:** manual pass is required; consider snapshot story only if time permits (out of scope unless blocking).
- **Light mode regression:** shared token additions must not change `:root` light values; run contrast test in light mode for any new shared pairs touched by component refactors.

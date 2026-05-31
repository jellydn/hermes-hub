# 7. Tailwind CSS v4 with Custom Island Components

Date: 2026-05-31

## Status

Accepted

## Context

The application needs a clean, modern UI that looks polished without requiring a full component library. The design emphasizes card-based layouts ("islands"), soft rounded corners, and a teal/sea-ink color palette that aligns with the Hermes brand.

CSS must be lightweight, maintainable, and minimize runtime overhead.

## Decision

Use Tailwind CSS v4 with the `@tailwindcss/vite` plugin for build-time CSS generation, combined with custom CSS custom properties for the design system.

Key decisions:

- **Tailwind v4** with the Vite plugin — no PostCSS config needed, on-demand CSS generation
- **Custom CSS variables** in `src/styles.css` define the design tokens (colors, border radii, spacing), not Tailwind's `tailwind.config`
- **`island-shell`** utility class and related `.island-kicker` patterns are defined as custom CSS classes for the card-based UI pattern rather than composing Tailwind utilities in every component
- **`tailwind-merge`** (`cn()` helper) for merging class names without conflicts
- **`class-variance-authority`** for component variant APIs (Button variants)
- **`lucide-react`** for icons — tree-shakable, consistent stroke-based icon set
- **`@radix-ui/react-slot`** for composable component primitives (as-child pattern)

## Consequences

### Positive

- Minimal CSS bundle — Tailwind v4's Vite plugin generates only the used utility classes
- Consistent design language through CSS custom properties
- No runtime CSS-in-JS overhead
- The island/card pattern is reusable across all authenticated pages
- Icons are explicit imports rather than a spritesheet or icon font

### Negative

- Custom CSS properties are not type-checked — typos in variable names produce silent fallbacks
- The island-shell pattern is not documented as a component — new developers must read `styles.css` to understand available design tokens
- Tailwind v4's `@apply` directive is discouraged, making component abstraction harder without `class-variance-authority`
- No dark mode strategy is explicitly defined — the theme toggle switches between light/dark via a class, but the CSS variable system must be maintained in two places

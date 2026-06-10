---
name: HermesHub
colors:
  primary: "#173a40"
  on-primary: "#d7ece8"
  primary-container: "#328f97"
  on-primary-container: "#8de5db"
  secondary: "#416166"
  on-secondary: "#afcdc8"
  tertiary: "#4fb8b2"
  on-tertiary: "#60d7cf"
  error: "#ffb4ab"
  surface: "rgba(255, 255, 255, 0.74)"
  surface-dim: "#f3faf5"
  surface-bright: "rgba(255, 255, 255, 0.9)"
  surface-container: "rgba(255, 255, 255, 0.8)"
  background: "#e7f3ec"
  outline: "rgba(23, 58, 64, 0.14)"
  success: "#2f6a4a"
  on-success: "#6ec89a"
typography:
  display:
    fontFamily: Fraunces
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.02em
  headline-1:
    fontFamily: Fraunces
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-2:
    fontFamily: Fraunces
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.01em
  title:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.16em
rounded:
  full: 9999px
  xl: 32px
  lg: 28px
  md: 24px
  sm: 12px
spacing:
  page: 32px
  section: 24px
  card: 24px
  element: 16px
  compact: 12px
components:
  button-primary:
    backgroundColor: "rgba(79, 184, 178, 0.16)"
    borderColor: "rgba(50, 143, 151, 0.3)"
    textColor: "{colors.primary-container}"
    rounded: "{rounded.full}"
    padding: 10px 20px
    shadow: "0 10px 30px rgba(50, 143, 151, 0.12)"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.7)"
    borderColor: "rgba(23, 58, 64, 0.18)"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 10px 20px
  island-shell:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.xl}"
    shadow: "0 1px 0 rgba(255, 255, 255, 0.82) inset, 0 22px 44px rgba(30, 90, 72, 0.1), 0 6px 18px rgba(23, 58, 64, 0.08)"
    backdropFilter: "blur(4px)"
  input:
    backgroundColor: "rgba(255, 255, 255, 0.7)"
    borderColor: "{colors.outline}"
    rounded: 16px
    padding: 12px 16px
  chip:
    backgroundColor: "rgba(255, 255, 255, 0.8)"
    borderColor: "rgba(47, 106, 74, 0.18)"
    rounded: "{rounded.md}"
    padding: 12px 16px
  feature-card:
    backgroundColor: "linear-gradient(165deg, rgba(255,255,255,0.93), rgba(255,255,255,0.74))"
    rounded: "{rounded.full}"
    shadow: "0 1px 0 rgba(255, 255, 255, 0.82) inset, 0 18px 34px rgba(30, 90, 72, 0.1), 0 4px 14px rgba(23, 58, 64, 0.06)"
---

# Design System

## Overview

HermesHub is a tool that removes the terminal for deploying and managing a
self-hosted Hermes AI Agent on any VPS. The interface communicates confidence,
approachability, and a palm-tree-leaning calm — tropical greens against warm
off-white surfaces, generous rounded panels that feel like physical islands,
and motion that stays subtle and deliberate.

The brand personality is **guided but not bossy**, **technical but not hostile**.
The UI is for people who know what a server is but would rather see a wizard
than type SSH commands. Every screen feels like a well-designed product, not
another cloud console.

## Colors

The palette is rooted in tropical coastal tones — deep sea-ink text, brackish
lagoon accents, palm-leaf greens for positive signals — against warm sand and
foam backgrounds. The dark mode inverts the relationship: the sea becomes pale
jade text, and the sand becomes deep midnight.

### Light Mode

| Token            | Value                    | Usage                                                                    |
| ---------------- | ------------------------ | ------------------------------------------------------------------------ |
| `sea-ink`        | `#173a40`                | Headlines, body text, primary content color.                             |
| `sea-ink-soft`   | `#416166`                | Secondary text, captions, metadata, muted navigation.                    |
| `lagoon`         | `#4fb8b2`                | Accent color — gradients, hover underlines, active indicators.           |
| `lagoon-deep`    | `#328f97`                | Interactive color — focused CTAs, links, active icons, focus rings.      |
| `palm`           | `#2f6a4a`                | Positive affirmation — success states, kicker text, verification badges. |
| `sand`           | `#e7f0e8`                | Page background gradient start (top).                                    |
| `foam`           | `#f3faf5`                | Page background gradient end (bottom).                                   |
| `bg-base`        | `#e7f3ec`                | Solid fallback background color.                                         |
| `surface`        | `rgba(255,255,255,0.74)` | Card, panel, and shell backgrounds (translucent).                        |
| `surface-strong` | `rgba(255,255,255,0.9)`  | Heavier card backgrounds for emphasis.                                   |
| `line`           | `rgba(23,58,64,0.14)`    | Borders, dividers, hr separators.                                        |
| `inset-glint`    | `rgba(255,255,255,0.82)` | Inner shadow highlight for glassmorphic depth.                           |
| `kicker`         | `rgba(47,106,74,0.9)`    | Section label/kicker text (uppercase).                                   |
| `header-bg`      | `rgba(251,255,248,0.84)` | Sticky header background.                                                |
| `chip-bg`        | `rgba(255,255,255,0.8)`  | Chip, tag, and small stat card backgrounds.                              |
| `chip-line`      | `rgba(47,106,74,0.18)`   | Chip, pill, and inner-card borders.                                      |
| `hero-a`         | `rgba(79,184,178,0.36)`  | Radial gradient overlay — top-left hero glow.                            |
| `hero-b`         | `rgba(47,106,74,0.2)`    | Radial gradient overlay — bottom-right hero glow.                        |

### Dark Mode

| Token            | Value                    | Usage                               |
| ---------------- | ------------------------ | ----------------------------------- |
| `sea-ink`        | `#d7ece8`                | Primary text on dark backgrounds.   |
| `sea-ink-soft`   | `#afcdc8`                | Secondary text, metadata (dark).    |
| `lagoon`         | `#60d7cf`                | Accent (dark).                      |
| `lagoon-deep`    | `#8de5db`                | Interactive color (dark).           |
| `palm`           | `#6ec89a`                | Success states, kicker text (dark). |
| `sand`           | `#0f1a1e`                | Background start (dark).            |
| `foam`           | `#101d22`                | Background end (dark).              |
| `bg-base`        | `#0a1418`                | Solid background (dark).            |
| `surface`        | `rgba(16,30,34,0.8)`     | Card/shell background (dark).       |
| `surface-strong` | `rgba(15,27,31,0.92)`    | Strong card background (dark).      |
| `line`           | `rgba(141,229,219,0.18)` | Borders, dividers (dark).           |
| `inset-glint`    | `rgba(194,247,238,0.14)` | Inner shadow highlight (dark).      |
| `kicker`         | `#b8efe5`                | Label text (dark).                  |
| `header-bg`      | `rgba(10,20,24,0.8)`     | Sticky header (dark).               |
| `chip-bg`        | `rgba(13,28,32,0.9)`     | Chip backgrounds (dark).            |
| `chip-line`      | `rgba(141,229,219,0.24)` | Chip borders (dark).                |
| `hero-a`         | `rgba(96,215,207,0.18)`  | Gradient overlay (dark).            |
| `hero-b`         | `rgba(110,200,154,0.12)` | Gradient overlay (dark).            |

### Semantic Mapping

- **Interactive** → `var(--lagoon-deep)` / `var(--lagoon)`
- **Destructive / Error** → `#ffb4ab`
- **Success** → `var(--palm)`
- **Selection** → `rgba(79, 184, 178, 0.24)`
- **Focus Ring** → `var(--lagoon)` with 2px offset

## Typography

### Font Stack

- **Display / Headlines**: Fraunces (Georgia fallback) — serif, warm, editorial
  gravity. Used for hero titles (`display-title` class) and section headings.
- **Body / UI**: Manrope (system-ui fallback) — geometric sans, clean, readable
  at every weight. All navigation, body copy, labels, and buttons.

### Type Scale

| Role           | Family   | Size    | Weight | Line Height | Letter Spacing | Usage                                |
| -------------- | -------- | ------- | ------ | ----------- | -------------- | ------------------------------------ |
| Display        | Fraunces | 48px    | 700    | 1.02        | -0.02em        | Hero title on landing page.          |
| Headline 1     | Fraunces | 36px    | 700    | 1.1         | -0.02em        | Page titles, section headers.        |
| Headline 2     | Fraunces | 30px    | 700    | 1.15        | -0.01em        | Section headings, feature titles.    |
| Title          | Manrope  | 18px    | 600    | 1.3         | normal         | Card titles, sidebar, nav.           |
| Body           | Manrope  | 16px    | 400    | 1.6         | normal         | Paragraphs, description text.        |
| Body Small     | Manrope  | 14px    | 400    | 1.5–1.6     | normal         | Secondary info, metadata, footnotes. |
| Label (kicker) | Manrope  | 11–12px | 700    | 1.3         | 0.16em         | Section kickers (uppercased).        |
| Button         | Manrope  | 14px    | 600    | 1           | normal         | All button text.                     |

### Inline Styles

- **Links**: `var(--lagoon-deep)` with `text-decoration-thickness: 1px` and
  `text-underline-offset: 2px`. Hover darkens to `#246f76`.
- **Code**: `font-size: 0.9em`, `border: 1px solid var(--line)`, glassy
  background, `border-radius: 7px`, `padding: 2px 7px`. Inline only; block code
  strips the border and background.

## Layout

### Page Structure

- **Page width**: `min(1080px, calc(100% - 2rem))` centered with auto margins.
- **Content padding**: `16px` horizontal, `40–56px` vertical top, `40–48px`
  vertical bottom. Varies by page role.
- **Grid**: Two-column `260px sidebar + 1fr content` on dashboard pages.
  Collapses to single column below `1024px`.
- **Navigation**: Sticky header (`top: 0, z-index: 50`) with backdrop blur.
  Dashboard gets an additional sticky sidebar.

### Content Rhythm

- **Section spacing**: `24px` between major page sections.
- **Card padding**: `24px` horizontal, `24–32px` vertical.
- **Element gap**: `16px` between buttons, `12px` between compact controls.
- **List spacing**: `12px` between list items inside cards.

### Responsive Breakpoints

| Breakpoint | Behavior                                                     |
| ---------- | ------------------------------------------------------------ |
| < 640px    | Single column, smaller nav link indicators, reduced padding. |
| 640–1024px | Two-column if dashboard layout, otherwise stacked.           |
| ≥ 1024px   | Full sidebar + content grid.                                 |

## Elevation & Depth

HermesHub uses a glassmorphic elevation system — translucent surfaces with
subtle backdrop blur, inner-edge highlights, and soft outer shadows. There is
no hard Material-style z-index layering.

### Layer Definitions

| Layer   | Backdrop Blur   | Inner Glint | Outer Shadow                                                       | Usage                              |
| ------- | --------------- | ----------- | ------------------------------------------------------------------ | ---------------------------------- |
| Surface | 4px             | Yes         | `0 22px 44px rgba(30,90,72,0.1)`, `0 6px 18px rgba(23,58,64,0.08)` | Default cards, shells.             |
| Feature | 4px (inherited) | Yes         | `0 18px 34px rgba(30,90,72,0.1)`, `0 4px 14px rgba(23,58,64,0.06)` | Feature cards, highlighted panels. |
| Button  | None            | No          | `0 10px 30px rgba(50,143,151,0.12)`                                | Primary buttons.                   |
| Header  | 12px            | No          | None                                                               | Sticky top navigation.             |

### Motion

- **Default transition**: `180ms ease` for color, border, background, transform.
- **Hover lift**: `translateY(-2px)` on feature cards, `translateY(-0.5)` on
  buttons.
- **Entrance**: `rise-in` keyframe (`translateY(12px) → translateY(0)` +
  opacity) at `700ms cubic-bezier(0.16, 1, 0.3, 1)`. Shortened or cascaded
  per-card via `animation-delay`.

## Shapes

The system is defined by large-radius, pill-dominant shapes that evoke soft,
approachable physical objects.

| Shape       | Radius   | Applied To                                                       |
| ----------- | -------- | ---------------------------------------------------------------- |
| Full pill   | `9999px` | All buttons, nav logo chip, theme toggle.                        |
| Large card  | `32px`   | Primary content shells (`island-shell`), feature cards, sidebar. |
| Medium card | `28px`   | Side panels, aside notes, secondary shells.                      |
| Small card  | `24px`   | Summary cards, chip blocks, stat cards.                          |
| Input       | `16px`   | Text inputs, form fields.                                        |
| Inline code | `7px`    | Inline `<code>` elements.                                        |

No sharp corners anywhere on the page — every visible rectangle is at least
`16px` rounded at its most aggressive, cascading up to pill shapes.

## Components

| Component           | Shape       | Background                            | Border                           | Shadow / Elevation                  |
| ------------------- | ----------- | ------------------------------------- | -------------------------------- | ----------------------------------- |
| Primary Button      | Full pill   | `rgba(79,184,178,0.16)`               | `rgba(50,143,151,0.3)`           | `0 10px 30px rgba(50,143,151,0.12)` |
| Secondary Button    | Full pill   | `rgba(255,255,255,0.7)`               | `rgba(23,58,64,0.18)`            | None (relies on hover lift)         |
| Ghost Button        | Full pill   | Transparent                           | None                             | None                                |
| Input               | 16px        | `rgba(255,255,255,0.7)`               | `var(--line)`                    | None (focus ring on interaction)    |
| Island Shell        | 32px        | Translucent white (inset glint)       | `var(--line)`                    | Dual-layer soft shadow + inset      |
| Feature Card        | 32px        | Gradient white (inset glint)          | `var(--line)`                    | Lighter dual-layer shadow           |
| Chip / Summary Card | 24px        | `rgba(255,255,255,0.8)`               | `rgba(47,106,74,0.18)`           | None                                |
| Sidebar Nav Link    | 16px        | Transparent → chip-bg on hover/active | Transparent → chip-line on hover | Inset glint on hover                |
| Header              | None (flat) | `rgba(251,255,248,0.84)`              | `var(--line)` (bottom only)      | None (backdrop-blur-lg)             |
| Link                | Inline      | `underline-offset: 2px`               | N/A                              | N/A                                 |
| Kicker Label        | Inline      | N/A                                   | N/A                              | N/A (uppercased, 0.16em tracking)   |

### States

| State     | Behavior                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Hover     | `translateY(-0.5)` lift on buttons and cards. Links darken. Input border changes to `var(--sea-ink)`. |
| Focus     | `2px var(--lagoon)` ring + `2px` offset on buttons and inputs.                                        |
| Active    | Cards deepen border + background tint.                                                                |
| Disabled  | `opacity: 50%`, `pointer-events: none`.                                                               |
| Selection | Background tint at `rgba(79,184,178,0.24)`.                                                           |

## Do's and Don'ts

- **Do** use the lagoon colors sparingly — they are the accent signal for
  interactivity. Overuse dilutes their meaning.
- **Do** keep section kickers uppercased with wide letter-spacing; they provide
  scannable hierarchy without increasing font size.
- **Do** wrap content panels in `island-shell` for the signature glassmorphic
  look. The inset glint and soft shadow are the HermesHub visual identity.
- **Do** use Fraunces for any title that needs editorial weight — hero, section
  headers, page titles. Keep long-form body text in Manrope.
- **Don't** mix sharp and rounded corners in the same view. If a container has
  `rounded-[2rem]`, all interior sub-containers should be at least `rounded-md`
  but never square.
- **Don't** add extra shadow layers on top of `island-shell`. The built-in
  shadow tokens handle all elevation needs.
- **Don't** use the primary (`sea-ink`) color for disabled or inactive elements.
  Use `sea-ink-soft` so visual hierarchy is preserved.
- **Don't** apply backdrop blur to elements that scroll under the header or
  sidebar — blur performance degrades on long scroll regions.
- **Don't** animate entrance on every element. Reserve `rise-in` for the first
  visible section; subsequent content can appear without animation or with a
  staggered delay.
- **Do** maintain a 4:1 contrast ratio for all body text in both themes.
- **Don't** hardcode color values in component files. Reference CSS custom
  properties (`var(--lagoon)`, `var(--sea-ink)`, etc.) so the dark mode
  transform works automatically.

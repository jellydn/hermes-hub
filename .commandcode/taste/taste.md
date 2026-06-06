# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Design System
- Follow DESIGN.md specifications exactly for all UI components. Confidence: 0.90
- Use CSS custom properties from the design system (e.g., `--sea-ink`, `--lagoon`, `--palm`) instead of hardcoded values. Confidence: 0.85

# Accessibility
- Ensure AAA accessibility compliance: 7:1 contrast ratio for normal text, visible focus indicators, semantic HTML. Confidence: 0.90
- Minimum font size of 12px (0.75rem) for all text content per AAA standards. Confidence: 0.85
- Add aria-live regions for dynamic content updates. Confidence: 0.75

# Responsive Design
- Use responsive breakpoints consistently: mobile-first with sm/md/lg/xl breakpoints. Confidence: 0.80
- Dashboard layouts should stack gracefully on smaller screens. Confidence: 0.75

# Theming
- Support both light and dark modes using data-theme attribute and CSS custom properties. Confidence: 0.85
- Test all color combinations in both themes for accessibility compliance. Confidence: 0.75

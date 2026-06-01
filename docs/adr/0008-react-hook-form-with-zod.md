# 8. React Hook Form with Zod Validation

Date: 2026-05-31

## Status

Accepted

## Context

The application has several forms (login, server connection wizard, provider settings, server basics) that require input validation, error display, and controlled state management. Initial implementations used `useState` with manual handlers and ad-hoc validation functions (e.g., `validateServerBasicsDraft`), leading to:

- Boilerplate `onChange` handlers for each field
- Inconsistent error handling patterns across forms
- Manual state synchronization between form fields and local state
- No type-safe schema definition shared between client and validation logic

A form library was needed to standardize state management, validation, and error display.

## Decision

Use **react-hook-form** for form state management with **zod** schemas (resolved via `@hookform/resolvers/zod`) for validation.

Key decisions:

- **react-hook-form** as the form library — minimal re-renders, uncontrolled inputs by default, small bundle size (~9 KB gzipped)
- **zod** for validation schemas — TypeScript-first schema definition with inferred types, no runtime dependency on validation logic being co-located with form components
- **`@hookform/resolvers/zod`** bridge — integrates zod schemas directly into react-hook-form's resolver pipeline
- **`z.string().trim().min(1, msg)`** pattern for required field validation — consistent user-facing error messages defined in the schema, not in the component
- **Port number refinement** via `z.string().refine(val => isValidPort(val), msg)` for SSH port validation
- **Hostname/IP refinement** via `z.string().refine(val => isValidHost(val), msg)` with a reusable `isValidHost` helper
- Existing `ServerBasicsErrors` type and `validateServerBasicsDraft` function replaced by zod schema inference — `FieldErrors<typeof schema>` from react-hook-form
- `ServerBasicsForm`, `ConnectionWizard`, `Login` page, and `ProviderSettings` migrated from `useState` + manual `onChange` to `useForm` + `register`/`setValue`/`watch`

## Consequences

### Positive

- Validation rules are defined once in zod schemas and produce TypeScript types automatically via `z.infer`
- Consistent error message format across all forms — each field error is a string (`.message`), not a union of string | undefined
- react-hook-form's uncontrolled inputs reduce re-render overhead compared to `useState` + controlled inputs
- `register()` eliminates manual `onChange` handlers and value bindings
- `useForm` default values can be populated from server data (e.g., `createInitialFormState(initialConfig)`) directly
- `setValue()` provides imperative field updates without pushing through React state

### Negative

- Adds two runtime dependencies: `react-hook-form` (~9 KB) and `zod` (~10 KB gzipped in client bundle)
- zod v4 API differs from v3 — `z.string().min(1)` works in both, but ecosystem examples often reference v3 syntax
- `@hookform/resolvers` adds a thin integration layer that must be kept compatible with both libraries
- `z.refine()` callbacks are not type-safe in the error message return — TypeScript infers `string | undefined` rather than forcing a message
- Forms that need complex cross-field validation (e.g., SSH key file vs password) must use `z.refine()` at the object level, which can produce uglier error paths

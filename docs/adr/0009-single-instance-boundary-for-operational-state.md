# 9. Single-Instance Boundary for Operational State

Date: 2026-06-01

## Status

Accepted

## Context

HermesHub manages several kinds of operational state that are currently held in process memory:

- **Install streams** — live progress events from SSH-based install commands, pushed to clients via SSE
- **Session credentials** — temporary VPS credentials scoped to a browser session during install wizards
- **Magic-link rate limiting** — per-email rate counters for the magic-link login flow
- **Dashboard caches** — in-memory computed aggregates for the dashboard view

None of this state is persisted to PostgreSQL or an external cache. If HermesHub is deployed with multiple nodes behind a load balancer, a client's request may reach a node that does not hold its install stream or session credential, causing the operation to fail silently.

The current deployment is a single container on a single VPS. There is no imminent product requirement for horizontal scaling.

## Decision

Explicitly optimize for single-instance deployment in the near term. All in-memory operational state remains in-process because:

- Keeping state in-process avoids cache-warming latency, serialization overhead, and additional infrastructure (Redis, PostgreSQL LISTEN/NOTIFY, or a shared KV store)
- The team's current priorities are correctness (install idempotency, credential lifecycle, audit completeness) and security (rate-limit tightening, encrypted session storage) — not horizontal scaling
- The in-memory state types are all recreatable or degrade gracefully: a page refresh restores the dashboard cache, rate-limit counters reset on restart, and an expired install stream requires the user to retry
- Multiple-instance deployment is not a product requirement and is not expected to become one until the user base grows significantly

Multi-instance support will be addressed in a later milestone. When that work begins, the plan is to externalize state into PostgreSQL (for session-anchored data) or Redis (for transient streams and rate counters) behind a thin abstraction that the in-process implementations already approximate.

## Consequences

### Positive

- Simple deployment topology — one container, no dependency on Redis or shared storage
- No serialization or network round-trips for operational state access — install events and rate checks are serviced in microseconds
- The team can focus on correctness and security issues that affect all users regardless of deployment scale
- Postponing the abstraction avoids premature generalization — the right API for externalized state will be clearer once the correctness work settles

### Negative

- Rolling deploys terminate active install streams and in-flight session credentials — the user sees a broken SSE connection and must retry
- Rate-limit counters reset on each restart, giving a brief window of elevated magic-link traffic after deploy
- The dashboard cache is cold after every restart, making the first dashboard load slower until aggregate queries repopulate
- When multi-instance is eventually needed, every in-memory state site must be audited and converted — this is a predictable but deferred cost

<!--
Sync Impact Report
- Version change: template/unversioned → 1.0.0
- Modified principles: N/A (template placeholders replaced)
- Added sections: Technical Standards; Workflow & Quality Gates (filled)
- Removed sections: N/A
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): confirm if 2025-12-27 is the intended ratification date
-->

# NossoCRM Constitution

## Core Principles

### I. Security & Tenant Isolation (NON-NEGOTIABLE)
- Data access MUST be protected by **Supabase RLS** and tenant scoping via `organization_id`.
- Secrets (AI keys, service role keys) MUST NOT be exposed to the client; keep them server-side.
- Any new API surface MUST define its auth model explicitly (user session vs API key) and log/handle 401/403 correctly.
- Public/Integration endpoints MUST be contract-first (OpenAPI) and stable.

### II. Contract-First Interfaces
- If you add/change endpoints under `app/api/public/v1/*`, you MUST update the OpenAPI source of truth and keep Swagger rendering working.
- Any “client app” (web, iOS, integrations) MUST rely on a documented contract: OpenAPI for HTTP, shared types for internal modules.
- Prefer fewer, well-designed endpoints over many ad-hoc ones; when an operation is composite (e.g., move stage + log + notify), create a single server-side contract for it.

### III. Mobile-First UX & Responsive Shell
- All new UI MUST be responsive and mobile-friendly; treat tablet as a first-class breakpoint.
- Navigation MUST follow adaptive patterns: bottom navigation (mobile), rail (tablet), sidebar (desktop).
- Modal-like flows on mobile SHOULD be implemented as sheets/fullscreen sheets to avoid layout breakage.
- Accessibility is required: keyboard/focus management for dialogs/sheets, sufficient contrast, and semantic labels.

### IV. Offline & Sync Correctness (when applicable)
- If a feature claims offline support, it MUST define: local source of truth, mutation queue, retry/backoff, and conflict strategy.
- Server operations used by offline queues MUST be idempotent or safely retryable.
- Sync MUST be observable: track last sync cursor/time and surface actionable errors to users.

### V. Quality Gates & Living Documentation
- Significant changes MUST update `docs/changelog.md` with date (DD/MM/AAAA), summary, and technical notes.
- Code MUST remain type-safe (TypeScript), lint-clean, and readable (small modules, clear naming).
- Tests are required when a change impacts: auth/RLS, Public API contract, data migrations, or critical business flows.

## Technical Standards

- **Primary stack**: Next.js (App Router), React, TypeScript, Supabase (Auth/Postgres/RLS), TanStack Query, Tailwind CSS.
- **API strategy**:
  - Internal web app: can use Supabase SDK directly with RLS.
  - Public/Integrations: `app/api/public/v1/*` with OpenAPI contract and `X-Api-Key`.
  - Composite operations: prefer server-side endpoints (Route Handlers / Edge Functions) to avoid duplicating business rules in clients.
- **Performance**:
  - Prefer pagination/cursors for large lists; avoid “fetch everything forever”.
  - Use optimistic updates carefully; always reconcile server truth.
- **Accessibility**:
  - Focus trapping for dialogs/sheets; proper `aria-*` labels; avoid keyboard traps.

## Workflow & Quality Gates

- **Spec-driven delivery**: non-trivial work SHOULD start with a spec and plan (Speckit templates).
- **PR checklist**:
  - RLS/auth impact reviewed
  - OpenAPI updated if Public API changed
  - Changelog updated for significant changes
  - Mobile/tablet UX verified for UI changes
- **Versioning policy for this constitution**: SemVer (MAJOR incompatible governance changes, MINOR new/expanded principles, PATCH clarifications).

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

- This constitution supersedes lower-level docs when conflicts exist.
- Amendments MUST:
  - describe the change,
  - include migration/rollout notes when behavior changes,
  - update dependent templates if they encode gates/sections.
- Compliance is checked during review: changes that violate principles require explicit justification and mitigation.

**Version**: 1.0.0 | **Ratified**: 2025-12-27 | **Last Amended**: 2025-12-27
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->

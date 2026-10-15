# FoxPassport Republic API Rules

## 1. Mandatory Branching & Checkpoint Safety
- **Always Create a Dedicated Branch**: Before modifying or creating code for any new feature, bug fix, or optimization, **always create and checkout a dedicated Git branch** (e.g., `feat/<name>`, `fix/<name>`, `perf/<topic>`). Never develop directly on `main` or `master`.
- **Working Tree & Dirty State Protocol**:
  - Before taking any action, run `git status` and `git diff` to identify all uncommitted files.
  - **Never automatically stash, commit, reset, or discard (`git checkout .`, `git reset --hard`, `git clean`) existing uncommitted work.**
  - If the task can be safely isolated without disturbing existing work, proceed on a dedicated branch.
  - If isolation is unclear or the task touches overlapping files, stop and ask the user for clarification before modifying them.
- **Establish Baseline Checkpoints**: Commit or tag a clean baseline state before starting risky, complex, or multi-step changes so work can be rolled back safely.

---

## 2. Architecture & Layer Boundaries
This repository enforces Clean Architecture via `pnpm validate` (`tools/validate-architecture.mjs`). Layers are strictly identified by file suffixes:
- **Repositories (`*.repository.ts`)**: Direct database and Prisma access only. May import utils, helpers, config, constants, and Prisma client. **Never import services, controllers, or routes.**
- **Services (`*.service.ts`)**: Business and domain logic. May import repositories, infrastructure, events, utils, helpers, and constants. **Never import controllers or routes.**
- **Controllers (`*.controller.ts`)**: HTTP request handling, input extraction, and response formatting. May import services, helpers, utils, and constants. **Never import routes or make direct Prisma/database queries.**
- **Routes (`*.routes.ts`)**: Route wiring, middleware binding, and permission guards.
- **Utils / Helpers / Constants**: Agnostic logic. **Must never import any business layer.**

---

## 3. RBAC & Capability-Based Access Control
Enforced via `pnpm validate:rbac` (`tools/validate-rbac-guards.mjs`):
- **Banned Role Guards**: Never use `requireRole`, `requireAdmin`, or `requireHost`. These are legacy patterns rejected by the validation script.
- **Use Capability Permissions**: Protect authenticated routes using `requirePermission(...)` or `requirePermissionAny(...)` from `src/middleware/auth.middleware.ts`.
- **Ownership-Guarded Routes**: Routes authenticated without route-level capability checks must validate resource ownership inside the service layer (e.g., citizens viewing their own profile) and conform to the audited baseline in `tools/validate-rbac-guards.mjs`.

---

## 4. Authentication & Security
- **Better Auth as the Primary Authentication System**: Use Better Auth for authentication, session management, password-based login, and supported OAuth providers. Do not introduce new custom authentication or JWT flows when Better Auth already provides the required functionality.
- **No New Legacy JWT Dependencies**: Do not add new legacy JWT authentication middleware, token-generation logic, refresh-token flows, or endpoints.
- **Legacy Migration**: Preserve existing JWT compatibility only where required by verified, active dependencies during migration. Remove legacy authentication code once all dependent clients, routes, and integrations have migrated and the removal has been tested.
- **Strict Session Security**: Validate Better Auth sessions through the configured, supported authentication mechanisms. Never bypass session validation or weaken cookie, session-expiration, or credential security.
- **Credential Integrity**: Use Better Auth's supported APIs and hooks for password changes and account management. Preserve compatibility with legacy credential data only while active dependencies require it. Never store or log plaintext passwords.
- **Verified Email Status**: Preserve `emailVerified: true` for intentionally verified seed and test accounts where required by integration tests. Do not automatically mark real user accounts as verified.

---

## 5. Database, Prisma & Migration Safeguards
- **Review Generated SQL First**: Always inspect generated SQL migration files before applying migrations to shared, staging, or production databases.
- **Never Auto-Generate Table Renames**: `prisma migrate diff` cannot detect a rename and outputs `DropTable` + `CreateTable`, destroying existing records. Hand-write `ALTER TABLE ... RENAME TO` migrations (see ADR 0003).
- **Production-Grade Migration Safety for Populated Tables**:
  - When adding columns or constraints, consider table size, transaction lock duration, and concurrent write traffic.
  - Never add a `NOT NULL` column without a `@default` in a single step against an active table. Follow the safe three-step sequence: add nullable -> backfill data -> apply `NOT NULL` constraint.
  - For high-volume or large tables, use batched/chunked backfills rather than single monolithic updates to avoid lock contention.
  - Maintain backward and forward compatibility between old and new application versions during zero-downtime deployments, and define clear rollback procedures.
- **Preserve `prisma.config.js` Paths**: Keep both `schema` (`prisma/schema`) and `migrations.path` (`prisma/migrations`) properly configured. Misconfiguration leads to Prisma silently reporting migrations as up-to-date against an empty history.
- **Always Regenerate the Client**: Run `pnpm exec prisma generate` immediately following any schema modification.

---

## 6. Testing Honesty & Mock Integrity
- **Honest Verification Reporting**: If any test, linter, or validation step fails, report the exact failure explicitly. **Never claim completion just because `pnpm build` or TypeScript passes.**
- **`vi.mock()` String Validation**: `vi.mock()` paths are unchecked strings. Stale paths silently fail to mock and pass against real implementations. When renaming or moving files, verify that all mock targets resolve to real files.

---

## 7. Scope Control & Task Discipline
- **Strict Scope Boundaries**: Avoid unrelated refactors, formatting sweeps, or behavioral changes to existing features unless directly required by the current task.
- **Preserve Code Intent**: Maintain existing comments, documentation, and error-handling patterns that are unrelated to your assigned changes.

---

## 8. Source of Truth & Reference Hierarchy
- **Prisma Schema (`prisma/schema/*.prisma`)**: The single source of truth for data models, relations, and enums (`RoleType`, `SystemRole`).
- **`CONTEXT.md`**: The source of truth for marketplace concepts, roles (`Citizen`, `VenueFoxer`, `EventFoxer`, `Mayor`, `Organizer`), and terminology.
- **`docs/GOTCHAS.md`**: The detailed reference for historical pitfalls, silent failure modes, and migration edge cases.
- **`AGENTS.md` (This File)**: The operational behavioral rules and guardrails that agents must strictly obey.

---

## 9. Pre-Completion Verification Checklist
Every task must execute the following five commands:
1. `pnpm validate` — Clean architecture layer boundary validation
2. `pnpm validate:rbac` — RBAC capability guard validation
3. `pnpm lint` — ESLint static code analysis
4. `pnpm test` — Vitest unit & integration test suite
5. `pnpm build` — Prisma client generation & TypeScript compilation check

**Reporting Requirements**: For each command, the agent must clearly categorize the result as:
- **Passed**: Clean execution.
- **Failed (Changes)**: Failed due to recent changes (must be fixed before completion).
- **Pre-existing Failure**: Unrelated failure that already existed before this task.
- **Blocked**: Cannot run due to missing environment variables, local services, or infrastructure.
*Never silently skip a check or misrepresent a blocked check as a pass.*

---

## 10. Mandatory Completion Report
Before concluding any task, provide a structured completion report with the following details:
- **Branch**: Dedicated branch used.
- **Changes**: Concise summary of what was implemented or resolved.
- **Files**: Important files created, modified, or removed.
- **Database**: Any schema changes, migrations created, or Prisma client updates.
- **Security**: Authentication, authorization (RBAC), or data-integrity implications.
- **Verification**: Exact status of the 5 verification checks (Passed, Failed, Pre-existing, or Blocked).
- **Remaining Work**: Known limitations, unresolved edge cases, or follow-up recommendations.

*Never declare a task complete when required verification remains unsuccessful or unperformed. Clearly distinguish implemented code from work that was merely planned.*



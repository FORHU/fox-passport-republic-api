# FoxPassport Republic API Rules

## 1. Git Branching and Work Safety

### Inspect Before Editing
- Before making any changes, inspect `git status`, the current branch, and `git diff`.
- Check for uncommitted changes and understand whether they belong to the current task.
- Never discard, reset, clean, stash, or commit existing work without explicit authorization.

### Dedicated Branches Are Mandatory
- Before implementing a new feature, bug fix, refactor, optimization, or other code change, create or switch to a dedicated task branch.
- Never develop directly on `main`, `master`, or a shared integration branch.
- Use descriptive branch names:
  - `feat/<short-description>` — new features
  - `fix/<short-description>` — bug fixes
  - `perf/<short-description>` — performance improvements
  - `refactor/<short-description>` — refactoring
  - `docs/<short-description>` — documentation
  - `test/<short-description>` — tests

### Preserve Existing Work
- If the current branch contains unrelated uncommitted changes, do not automatically commit, stash, or move them.
- If the task can be safely isolated, create the task branch while preserving the existing working tree.
- If existing changes overlap with the requested task or their ownership is unclear, stop and ask for clarification before editing.
- Before switching branches, check whether doing so could carry uncommitted changes into another task.

### Branch Creation and Checkpoints
- Check whether the intended branch already exists before creating it.
- If it exists, inspect its status and history before deciding whether to reuse it.
- Never reset or overwrite an existing branch to make it match a preferred starting point.
- For risky or multi-step changes, establish a recoverable baseline when the working tree is clean and it is safe to do so. Do not commit unrelated changes to create a checkpoint.

### Completion
- Report the branch used in the task completion summary.
- Do not merge into protected or shared branches, push changes, or open a pull request unless requested or authorized by the project's workflow.

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
- **Client Session Contract (Web & Mobile)**: `auth.api.getSession` validates sessions passed either via HTTP `Cookie` headers (web app & mobile cookie manager) or `Authorization: Bearer <better_auth_session_token>` (mobile auth interceptor). Do not create separate custom JWT endpoints for mobile clients.
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



# FoxPassport Republic API Rules

## 1. Mandatory Branching & Checkpoints
- **Always Create a Branch for New Features/Tasks**: Before modifying or creating code for any new feature, bug fix, or optimization, **always create and checkout a dedicated Git branch** (e.g. `feat/<feature-name>`, `fix/<bug-name>`, `perf/<topic>`). Never develop directly on `main` or `master`.
- **Establish Baseline Checkpoints**: Always commit and/or tag a clean baseline checkpoint before starting risky or multi-step changes so work can be rolled back safely.

## 2. Authentication & Data Integrity
- **Dual-Path Authentication**: Maintain compatibility for both Better Auth sessions and legacy JWT tokens.
- **Credential Synchronization**: Ensure credentials in `Account` (Better Auth) and `User` (legacy) remain synced during registration, password changes, and seeding.
- **Preserve Verified Status**: Seeded and test accounts must maintain verified email status.

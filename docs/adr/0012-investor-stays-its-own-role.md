# Investor is shown under Provider but stays its own role

**Status: accepted (2026-11-27, rmValdez).** Docs only; nothing to build in this
repository. Applies to the web, mobile and Partners apps
(`fox-passport-republic-partners-app`, Republic Events).

## Context

The Partners app is one portal for business partners: Providers and Investors
apply and work there. The product proposal made Provider Foxer the umbrella
role, with Caterer, DJ, Photographer, Gear Supplier, Event Coordinator and
Investor as its specialties, so one company can offer several kinds of value on
one account.

Most of that already holds:

- `roleType` is an array: one user can be a Provider, Venue Foxer and Event
  Foxer at once, and stays a Citizen.
- Provider Foxer already is the umbrella for supply (ADR 0008), with several
  specialties per Provider.
- Event Coordinator is already decided as a Provider specialty that grants
  nothing until an Appointment (ADR 0005, decision of 26 Nov 2026).

Investor is different. It is its own `investor` RoleType with:

- its own application (`InvestorApplication`: investment range, proof of funds);
- its own permissions (`partnership:propose`, `payouts:onboard` in
  `src/types/permissions.ts`; `InvestmentSvc.createInvestment` checks the role);
- its own records and money (`PartnerInvestment`, `PartnershipProposal`, and
  `investor_revenue_share` payouts from `PayoutSvc.resolveInvestorSplit`).

Specialties are category tags. They grant no permissions.

## Decision

- **Product:** Investor is presented under Provider Foxer, in the Partners app's
  Investment section.
- **Backend:** Investor stays its own `investor` RoleType, with its own
  application, permissions and records. No specialty grants a permission.
- **Accounts:** one account may hold any combination of RoleTypes and Provider
  specialties. `SystemRole` (user, admin secretary, admin) stays a separate axis.
- **One system:** one FoxPassport API, one PostgreSQL database, one Better Auth
  sign-in. The Partners app adds a business-facing experience and never a second
  copy of FoxPassport's business rules.
- **Out of the initial scope:** collecting investment money, limits on how
  revenue shares add up, and legal agreements for investors.

## Considered and rejected

- **Investor as a Provider specialty.** It would need specialties that grant
  permissions: a second permission mechanism beside RoleTypes, a data migration
  for existing investors, and changes to every RBAC check, only to change how the
  interface groups things. The same grouping is reached in the interface alone,
  as Event Coordinator already is (`organizer`, shown under Provider Foxer).

## Consequences

- The Partners app reads roles from the session (`roleType[]`, `systemRole`,
  permissions) and groups Investor under Provider in its navigation.
- Applying as Investor uses the existing role requests (`POST
  /v1/role-requests/apply`) with the investor fields; the admin queue is
  unchanged.
- If investors later collect money through the platform, that is a new decision
  (terms, limits, legal review), not a change to this one.

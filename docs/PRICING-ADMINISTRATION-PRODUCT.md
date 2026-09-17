# Product Management Correction — Pricing, Fees & Promotions

**Document Type:** Product Management
**Date:** 14 September 2026
**Status:** Active
**Companion to:** `docs/PAYMENTS.md` (the technical map this document's claims were checked against — every "implemented"/"not implemented" status below matches that doc's §1–§7, verified against current code, not assumed).

## 1. Pricing Configuration Strategy

FoxPassport should support configurable pricing and monetization rules rather than hard-coding a single pricing model.

The product should eventually allow authorized administrators to configure:

* platform fees;
* Host Markup;
* category-specific fees;
* subcategory-specific fees;
* transaction-type-specific fees;
* fixed or percentage-based fees;
* promotions;
* vouchers;
* usage limits;
* customer-specific restrictions;
* validity periods.

The product should therefore support:

> **Centralized, configurable, category-aware pricing.**

However, Product Management must distinguish between what the system **supports in its data model** and what administrators can **actually configure through the product**.

---

## 2. Current Pricing Capability

As of 14 September 2026:

### Host Markup

**Status: Implemented and dynamically configurable.**

Host Markup is configured per Event Template rather than globally per category.

Authorized users can:

* set Host Markup when creating an Event Template;
* update Host Markup later;
* change the value after publication;
* change the value even when live bookings exist.

The updated value is applied to subsequent pricing calculations.

Therefore:

> **Host Markup is currently a real product-level dynamic pricing capability.**

---

## 3. Platform Fee

### Status: Partially implemented

FoxPassport already has a `PlatformFeeConfig` model designed to support:

* percentage fees;
* fixed fees;
* transaction type;
* category;
* subcategory;
* priority-based fee resolution.

The newer Central Payment pricing engine can read this configuration.

However, there is currently no complete administrative product interface for managing these configurations.

There is currently:

* no platform-fee administration screen;
* no platform-fee CRUD controller;
* no platform-fee management route;
* no normal administrator workflow for creating or updating fee configurations.

Older direct-booking/event-template flows still rely on the flat `PLATFORM_FEE_PERCENT` environment configuration — confirmed, not hypothetical: `EventTemplate.platformFeePct` (the per-template override column) is currently write-only and has no effect on pricing.

Therefore:

> **The platform-fee system is structurally designed to be dynamic and category-aware, but it is not yet administratively dynamic.**

Database-level configuration should not be considered the intended business workflow.

---

## 4. Promotions and Vouchers

### Status: Partially implemented

The existing promotion and voucher models already support concepts such as:

* percentage discounts;
* fixed discounts;
* minimum subtotal;
* maximum discount;
* global usage limits;
* per-user usage limits;
* active date windows;
* category scoping;
* redeemable voucher codes.

The checkout/pricing system can validate and redeem these mechanisms.

However, there is currently no complete administrative management surface for them.

There is currently:

* no promotion creation interface;
* no voucher creation interface;
* no promotion management interface;
* no voucher management interface;
* no dedicated promotion administration workflow;
* no dedicated voucher administration workflow.

Therefore:

> **Promotions and vouchers are transaction-capable but not yet operationally self-service for administrators.**

---

# 5. Product Requirement: Pricing Administration

The long-term product should provide an authorized administrative pricing management capability.

Administrators should eventually be able to:

### Platform Fees

- [ ] create a fee rule
- [ ] update a fee rule
- [ ] activate/deactivate a fee rule
- [ ] define percentage or fixed fees
- [ ] assign transaction types
- [ ] assign categories
- [ ] assign subcategories
- [ ] define priority
- [ ] review the currently effective rule

### Host Markup

Host Markup should continue to remain controlled at the Event Template level where appropriate.

The product should preserve the distinction between:

> **Platform-controlled fees**

and:

> **Organizer-controlled markup.**

### Promotions

- [ ] create promotions
- [ ] define discount type
- [ ] define discount amount
- [ ] define minimum subtotal
- [ ] define maximum discount
- [ ] define validity
- [ ] define usage limits
- [ ] define category restrictions
- [ ] activate/deactivate promotions

### Vouchers

- [ ] create voucher codes
- [ ] assign promotions
- [ ] define validity
- [ ] define usage limits
- [ ] define category restrictions
- [ ] deactivate vouchers
- [ ] inspect redemption activity

---

# 6. Product Principle: Configuration Must Be Operational

A capability should not be considered fully implemented merely because the database supports it.

For business-facing configuration:

> **Data Model + Business Logic + Authorization + Administrative Interface = Operational Product Capability**

Therefore:

**PlatformFeeConfig table**

alone does not mean:

> "Administrators can configure platform fees."

Likewise:

**Promotion / Voucher models**

alone do not mean:

> "Marketing can create and manage promotions."

Product completion should be evaluated from the perspective of the authorized business user who needs to operate the capability.

---

# 7. Recommended Product Priority

Pricing administration should be treated as a **business-enablement capability**, not as a cosmetic admin feature.

Recommended priority:

### Priority 1 — Platform Fee Administration

Enable authorized administrators to manage:

- [ ] percentage/fixed fees
- [ ] category
- [ ] subcategory
- [ ] transaction type
- [ ] priority
- [ ] activation

### Priority 2 — Promotion Management

- [ ] Enable administrators to create and manage discount rules.

### Priority 3 — Voucher Management

- [ ] Enable administrators to create redeemable voucher codes linked to promotions.

### Priority 4 — Pricing Visibility and Audit

Provide:

- [ ] effective pricing-rule visibility
- [ ] configuration history
- [ ] who changed a rule
- [ ] when it changed
- [ ] previous value
- [ ] current value

This becomes increasingly important as transaction volume grows.

---

# 8. Product Roadmap Placement

Pricing administration should sit under:

> **Transactions → Business Operations → Administration**

It does not require creating a new marketplace category.

The capability should operate across the existing transaction infrastructure.

The desired architecture is:

**Experience / Booking**

↓

**Central Pricing**

↓

**Platform Fee**

*

**Host Markup**

*

**Promotion**

*

**Voucher**

↓

**Final Price**

↓

**Payment**

↓

**Transaction**

↓

**Settlement**

This keeps pricing centralized and reusable across future experience types.

---

# 9. Final Product Position

FoxPassport already has much of the **pricing foundation** required for a flexible marketplace.

The remaining gap is primarily:

> **Operational administration and controlled configuration.**

Therefore, Product Management should describe the pricing system as:

> **"Designed for dynamic, category-aware pricing, with Host Markup currently configurable through the product and platform fees/promotions/vouchers partially implemented but awaiting administrative management capabilities."**

This wording accurately separates:

* what exists;
* what works;
* what is configurable today;
* and what remains product work.

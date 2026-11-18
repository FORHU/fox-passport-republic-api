# Event pricing: one EventFoxer commission, a FoxPassport fee per category, and a processing fee

Replaces ADR 0001. Under ADR 0001, an EventFoxer set a markup percentage per
template. The platform fee was a flat environment percentage charged on the
items plus the markup. Central Payment checkout never charged the markup. A fee
rule set to 1% could be read as 100%. Nothing recorded what each Foxer's line
had cost, so payouts and refunds couldn't tell the commission, fee and Foxer
price apart. Decided 6–10 Nov 2026 with the product owner; built in #264
(PRs #271, #276, #280, #282, #304 and the final T15–T17 PR).

## Decisions

- **Every Foxer line is priced on its own:**
  `lineTotal = price + commission + FoxPassport fee + processing fee`.
  - Each amount is rounded half-up to 2 decimals per line, and Event totals
    are sums of the rounded lines.
  - The client sees every line and the total before paying.
- **The Foxer price is their own listing price** (× quantity for gear), never
  a price the EventFoxer typed into the template. An approved venue
  affiliation's agreed price counts as the Mayor's own.
- **One commission rate per EventFoxer** (`users.commissionPct`, 0–100), for
  all their Events.
  - It is charged on Foxer prices and paid to the EventFoxer.
  - An Event copies the rate when it is created (`events.commissionPct`), so
    changing the rate never moves a booked Event's price.
- **The FoxPassport fee is set by the admin per category**, as
  `PlatformFeeConfig` rules with `transactionType = "event_item"`.
  - A rule can match an item type, or an item type plus a listing category.
  - The most specific rule wins, and a 5% default covers the rest.
  - The fee is charged on the Foxer price only, never on the commission.
  - Percentages are stored as percent (1 means 1%).
- **A processing fee** (`PROCESSING_FEE_PERCENT`, default 3%) is charged per
  line, to cover card costs. It is checked at startup.
- **Every line stores its own snapshot** (category, rates and amounts) on its
  transaction row, and the invoice records every line it charged.
  - Payouts and refunds read those stored amounts, never recompute them.
  - The invoice snapshot is written and read in one module
    (`event-breakdown-snapshot.ts`).
- **The client pays before the Event; Foxers and the EventFoxer are paid
  after it** (at `completed`, as ADR 0002 decided).
  - Each Foxer receives their price.
  - The EventFoxer receives the commission charged on lines not rejected or
    cancelled.
  - The FoxPassport fee and the processing fee are never paid out.
- **Refunds apply each Foxer's cancellation policy % to the whole line**
  (owner decision, 10 Nov 2026).
  - A 100% policy returns everything the client paid for that line.
  - Only the Foxer's share is clawed back from them.
  - Stripe keeps its own fee on a refund, and FoxPassport absorbs it.
- **Vouchers aren't offered** on these Events yet: a discount would have to
  say which part of the line it comes out of.
- **Events priced before this change** (`commissionPct` null) keep their old
  pricing, checkout and payout.

## Considered and rejected

- **A commission per template:** what ADR 0001 did. One rate per EventFoxer
  is simpler to explain, and it was the owner's choice.
- **The fee on the commission too:** it would charge the client twice for the
  same service.
- **One flat platform fee:** the owner wants different fees per category.
- **Refunding only the Foxer price on cancellation:** this would keep the
  commission and fees on an Event that never happened.

## Not yet decided

- Ticket pricing for Events many people attend (Q9).
- Bids (Q5).
- Sponsorship payout timing (Q8).

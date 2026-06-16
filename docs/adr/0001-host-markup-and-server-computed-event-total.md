# Host markup is a per-template percentage, and Event totalAmount is server-computed

Before this decision, a Host had no modeled way to earn anything for assembling an
Event Template — Mayor and Foxer were paid per item via `EventTransaction`, but
`Event.totalAmount` was taken directly from the client request in `bookFromTemplate`
and never reconciled against what the providers were actually owed. This left Host
as the only RoleType with no real incentive to hold, and let a citizen submit an
arbitrary total.

We decided:
- Host sets a `hostMarkupPercent` per `EventTemplate` (not a flat amount, and not a
  platform-wide rate) — this scales naturally with the size of the assembled event
  and keeps pricing power with the Host, the same way a real event planner prices
  their own service.
- `Event.totalAmount` is computed server-side as
  `sum(attached items' agreedPrice) * (1 + hostMarkupPercent / 100)`. The
  client-supplied `totalAmount` in `bookFromTemplate` is no longer trusted.

Considered and rejected: a flat per-template fee (simpler, but doesn't scale with
event size) and a platform-wide percentage (simpler still, but removes Host's
ability to price their own curation work, and doesn't explain why Mayor's
event-only income is fine but Host having zero income wasn't).

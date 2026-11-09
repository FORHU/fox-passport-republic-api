# Gear, Talent and Performer Foxer are folded into Provider and removed

`gearFoxer`, `serviceFoxer` (shown as Talent Foxer) and `performerFoxer` were
three supply roles with three applications, three XP paths and three
dashboards, for people who often supply all three (a DJ who brings the sound
system, a caterer who rents tables). #228 added one `providerFoxer` role
alongside them. We decided to remove the old three completely: every holder,
application, XP path, specialization, badge and ledger row moves to
`providerFoxer`, and the old enum values and tables are dropped. Decided 9 Nov
2026; built in #273 (with app #258 and mobile #350).

## Decisions

- **Two migrations, in order.** `20261109140000_move_legacy_supply_roles_to_provider`
  moves the data and can run more than once. `20261109140100_drop_legacy_supply_roles`
  refuses to run while any legacy value or un-copied application remains,
  then drops the three application tables and rebuilds `RoleType` and
  `UserPath` without the old values (Postgres cannot drop an enum value).
  The drop is irreversible; undoing it means restoring a backup.
- **Applications keep their history.** Each old application is copied into
  `provider_foxer_applications` under the same request and id, documents
  included. Performer types land in `serviceTypes`, since performer
  categories are service categories.
- **XP paths are merged, not summed into the ledger.** A passport's gear,
  service, performer and existing provider paths become one `providerFoxer`
  path whose total is their sum; the level is recomputed with the same curve
  as `PassportSvc.calculateLevel` (checked against it).
- **The one exception to the append-only ledger.** `reward_events.path` on
  old rows is relabelled to `providerFoxer` so the enum value can go.
  Amounts, users, actions, refs, idempotency keys and timestamps are not
  touched, and no row is added or removed. No other ledger edit is allowed by
  this decision.
- **Specializations are re-keyed.** Where one person had the same category
  under two old roles, one Provider row is kept, an `earned` one over a
  `declared` one.
- **Older clients still work.** An application for an old role gets a 400 that
  points to `providerFoxer`, not "Invalid role type". Role filters
  (`/users/foxers?roleType=`, the leaderboard's `role=`) map old names to
  `providerFoxer` (`toRoleTypes`), and directory search finds Providers by
  "gear", "talent", "service" or "performer". Search keeps its
  `gearFoxers`/`serviceFoxers`/`performerFoxers` response keys, which web and
  mobile read; each now lists Providers.
- **Permissions are unchanged for the people moved.** `providerFoxer` already
  held every capability the three old roles had (`asset:manage`,
  `service:manage`, `performer:manage`, both bid permissions, payouts,
  promotions). `performer:manage` stays separate from `service:manage`; only
  the roles that held them are gone.

## Consequences

- The `20261109140100` migration rewrites `users`, `role_requests`,
  `foxer_specializations`, `passport_paths`, `badges` and `reward_events`
  under an exclusive lock while it runs, so deploy it at a quiet time.
- Everyone moved keeps one Provider rank and level instead of several, which
  can raise their level (the XP adds up).
- Notifications, emails and feed text written before the change still name the
  old roles; they are history and are not rewritten.

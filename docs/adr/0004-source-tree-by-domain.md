# 4. Organise the source tree by domain, and enforce the layer rule rather than the folder shape

Date: 2026-09-04

## Status

Accepted. 114 files moved, architecture scan green, 198 tests passing.

Supersedes nothing, but it deliberately diverges from
`rm-template/node-postg-backend-template`, and the reasoning for that is the
substance of this record.

## Context

`src/` was organised by layer: `controllers/`, `services/`, `repositories/`,
`routes/`, 114 files across the four. Working on venues meant four folders. A
`modules/notifications/` directory already existed, co-locating a controller,
service, repository, routes and types — someone had hit the wall and started a
different pattern without finishing it.

The house backend template, `node-postg-backend-template`, is laid out by layer.
So the question was whether foxpassport should stay aligned with it.

## Decision

**Move the four layers into `src/modules/<domain>/`,** finishing the pattern
`modules/notifications/` started. 31 modules. `src/routes/index.ts` stays where
it is — it is the router aggregator, a composition root rather than a domain.

**Diverge from the template on folder shape, and adopt its actual rule instead.**

The template's real standard is not its folders. It is
`tools/validate-architecture.mjs`, which enforces dependency *direction*:

```
repositories  →  utils, helpers, config, constants      (nothing above)
services      →  repositories, infrastructure           (never controllers/routes)
controllers   →  services                               (never routes)
routes        →  controllers, middleware
```

Folders are only how that file *detects* a layer — it reads the first path
segment. That detection does not survive a modular tree, where the first segment
is always `modules`. The rule does.

So the validator was ported to `tools/validate-architecture.mjs` here, with the
rules unchanged and layer detection taken from the filename suffix
(`venue.service.ts`) instead of the folder. The target layer is found by
resolving each import to a real file and reading *its* suffix, because a
specifier like `./venue.repository` carries no layer word at all.

`pnpm validate` runs it, matching the template's script name.

### Why not stay layered

The template is right for the template. It has 17 domain files, 7 models and a
174-line schema; at that size layering is just the default and modules would be
ceremony. This repository has 114 domain files and 42 models — seven times the
size, and the point where four flat folders stop describing anything.

The divergence is in shape only. On the rule that the template actually
enforces, this repository is now **stricter** than the template — see below.

## Consequences

### The alias plan was dropped, and should stay dropped

The first plan was to add `@/*` path aliases before moving anything, so imports
would stop encoding directory depth. That was abandoned on inspection: `start`
runs `node ./dist/src/server.js`, and **`tsc` does not rewrite path aliases in
emitted JavaScript**. Making them work needs `tsc-alias` in the build,
`tsconfig-paths` for `ts-node`, and an alias block for vitest — three new pieces
of runtime module resolution introduced by a refactor whose whole purpose was to
be safe.

Instead all 353 relative specifiers were recomputed: each resolved against its
old location, mapped through the move, and rewritten from the new one. `tsc`
verifies every one, and nothing about how the app resolves modules changed.

### Two failure modes that do not announce themselves

- **`vi.mock()` with a stale path does not throw.** The mock silently never
  applies and the test passes against the real implementation. Ten mock paths
  were rewritten; each was checked to resolve to a real file afterwards. Any
  future move must do the same.
- **Tests that read source files by path string** are invisible to an import
  rewriter. `tests/public-exposure.spec.ts` asserts route middleware chains by
  reading files off disk; five paths there needed updating by hand, and the
  suite caught it.

### The ported validator was inert on its first run

It reported a clean tree while every repository rule was dead, because the layer
name was derived as `"repository" + "s"` → `repositorys`, which matches no rule.
It was only caught by planting a deliberate violation and finding that the
validator did not flag it.

The mapping is now spelled out explicitly, with that history in a comment. **A
validator that passes is worth nothing until you have watched it fail** — the
probe is two lines and worth repeating after any change to it.

### Six real violations, fixed

Once working, the scan found controllers reaching the data layer directly:
`admin.controller.ts` (four repositories, ten call sites),
`event-request.controller.ts`, and `event-template.controller.ts`. All
pre-dated this work.

Six thin pass-through service methods were added, typed as
`Parameters<typeof Repo.method>` so the two signatures cannot drift. Two call
sites got more than a pass-through: `approveEvent` and `rejectEvent` now go
through `EventRequestSvc.approveRequest` / `rejectRequest`. `rejectRequest`
re-checks `queue:decide`; `approveRequest` re-checks `queue:read` (or
organizer ownership). The `/admin/*` routes are already gated on
`queue:decide`, and `GRANTS` (`src/types/permissions.ts`) currently grants
`queue:read` to every role that holds `queue:decide`, so this changes no
behaviour today — it adds a second layer, which is what the service methods
were written for. That pairing is incidental, not enforced: a future role
granted `queue:decide` without `queue:read` would fail `approveEvent` at the
service layer despite clearing the route.

**This repository is stricter than the template.** The template's validator
header says controllers may "NEVER import repositories directly", but its Rule 3
only checks `routes`. The comment and the code disagree. The rule implemented
here is the comment.

### Owed back to the template — **decided 4 Sep, not yet done**

This repository now carries two improvements the template does not, and the
decision was to push both back rather than let the ecosystem drift:

- [ ] **Port Rule 3b and suffix-based layer detection** into
      `rm-template/node-postg-backend-template/tools/validate-architecture.mjs`.
      Rule 3b makes it enforce what its own header already claims — that
      controllers may never import repositories directly, which its code does
      not currently check. Suffix detection makes the same validator work
      against a layered *or* a modular tree, so the template does not have to
      choose.
- [ ] **Adopt `src/modules/<domain>/` in the template itself**, so new backends
      start where this one had to arrive. Note the cost: projects already built
      on the template would then differ from it, which is the reason this is
      recorded as a decision rather than done in passing.
- [ ] **Consider the template's wider lint scope.** It runs `eslint .` and
      covers `prisma/**/*.ts`; this repository lints `src` only. Widening is
      cheap but will surface findings in seed and config files that nobody has
      looked at.

### Costs

- **Two shapes in the ecosystem** until the template is updated. Anyone moving
  between repositories meets a different tree.
- **`src/routes/` now holds one file.** Defensible — it is the route table — but
  it looks like a leftover.
- **Module boundaries are a judgement.** `google-auth`, `refresh-token` and
  `socket-ticket` were folded into `auth`; `role-assignment` into `admin`;
  `specialization` into `users`. Moving a file between modules is free and
  changes no behaviour, so treat these as adjustable.

# Republic feed: a ranked For you mix with older posts brought back, and a strict Recent

The Republic feed returned the same posts in the same order on every load.
Recent sorted pinned posts first, then newest. Top scored the newest 500 posts,
but its age penalty stopped growing after about 67 hours, so older posts
settled into a permanent order, and anything past the 500th was never shown
again. Decided 18 Nov 2026 with the developer (Luwijiiiiiiii) in app#308.

## Decisions

- **Two modes.** `GET /v1/feed?mode=foryou` is the ranked mix, and
  `mode=recent` is strictly newest first (`createdAt desc, id desc`). Web and
  mobile both send `mode`.
  - `top` is accepted as `foryou`, so older web tabs keep working.
  - No mode, or an unknown one, keeps the original pinned-first newest order,
    which older installed mobile builds expect.
- **A session is `{ seed, anchor }`.** The first page draws a random seed and
  sets the anchor to now. The cursor carries both plus an offset, as opaque
  base64url JSON. Every page rebuilds the identical list and slices it, so
  pages never repeat or skip a post. A refresh starts a new session and gets a
  new mix.
  - Posts newer than the anchor are left out. Clients pick them up through
    `feed:new` and `GET /v1/feed/new-count?since=<anchor>`. The response
    returns `anchor` (ISO, server time), so client clock skew can't hide or
    double-count a post.
  - A cursor that isn't valid, is from the future, or is over a day old is
    answered with 400.
- **Fresh pool: the newest 400 posts**, a count rather than an age, so the cost
  is the same in busy and quiet weeks. The weight is
  `(1 + likes×2 + comments×5 + shares×10) × affinity × 0.5^(hoursOld / 24)`.
  - Age is measured from the anchor.
  - `affinity` is 1.5 when the viewer follows the author or wrote the post.
- **Older pool: up to 100 posts sampled from everything older.** They have no
  age decay; the weight is `(1 + engagement) × min(1.25^days, 10)`.
  - `days` is the whole days since the post was last resurfaced, or since it
    was posted if never.
  - The boost compounds daily and resets when the post is shown, so a post
    that keeps being passed over eventually comes back.
  - It is shared per post for now. It becomes per viewer once view tracking
    exists (app#303), by adding a `viewerId` to `post_resurfacings`.
- **Order within each pool is a seeded weighted shuffle** (Efraimidis–Spirakis,
  `u^(1/w)` with `u` hashed from the seed and post id). Heavier posts usually
  lead, but the mix changes with every seed.
- **Composition.**
  - Position 1 is at most one pinned post, chosen by the seed, so the featured
    post rotates.
  - Every 4th position after it takes the next older post, labelled
    `resurfaced: true` ("From earlier").
  - Then no two posts in a row come from one author, and at most 2 per author
    fall in each block of 10. These rules relax only when nothing else is
    left.
- **Resurfacing is an append table, `post_resurfacings (postId, shownAt)`,
  read as of the anchor.** A page writes rows for the older posts it shows,
  best-effort and after the page is built. Those rows are newer than the
  session's anchor, so they never change the list that session is still
  paging. A daily job (`feed-resurfacing-prune.job.ts`, 03:30) deletes rows
  older than 11 days, the point where the ×10 cap is reached, keeping each
  post's latest.
- **Visibility is one shared `where`** for Recent, both pools, the featured
  pick, the page fetch and the new-post count, so none of them can show a post
  the viewer couldn't see before. `feed:new` is broadcast for public posts
  only, and carries just the tab.

## Consequences

- Ranking reads light columns: 400 fresh rows, plus every older visible post
  for the sample. Full post data is loaded only for the page shown.
- The older-pool read grows with the number of posts. If it gets slow, the
  fallback is seeded sampling at random points in time on
  `feed_posts_createdAt_idx`, which costs the same at any size but favours
  posts from quiet periods.
- A post created and pinned after a session's anchor waits for the next
  session.
- Not done here: down-ranking posts the viewer has already seen (needs app#303).

Code: `src/utils/feed-ranking.ts` (pure rules), `FeedService.getForYouFeed`,
`FeedRepo.findRankingCandidates`. Tests: `tests/feed-ranking.spec.ts`,
`tests/feed.foryou.integration.test.ts`, `tests/feed.mode.spec.ts`,
`tests/feed.new-post-broadcast.spec.ts`.

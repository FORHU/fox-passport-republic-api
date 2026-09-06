import { PrismaClient, PostType, FeedTab } from "@prisma/client";

// A handful of well-known seeded citizens (beyond the partner/venue-foxer
// owners already used as post authors below) so likes/comments come from a
// visibly diverse set of people rather than the same one or two accounts.
const CITIZEN_EMAILS = [
  "user@example.com",
  "multirole@example.com",
  "jasmine.reyes@foxers.ph",
  "marco.santos@foxers.ph",
  "sarah.lim@foxers.ph",
  "ef-01@foxers.ph",
  "gf-01@foxers.ph",
  "sf-01@foxers.ph",
];

export async function seedFeed(prisma: PrismaClient) {
  console.log("Seeding Republic Foxer feed...");

  const partner = await prisma.user.findUnique({
    where: { email: "partner@example.com" },
  });
  const fallbackUser = await prisma.user.findFirst({
    where: { email: "user@example.com" },
  });

  if (!partner || !fallbackUser) {
    console.warn(
      "⚠️ Cannot seed feed: partner or fallback user not found. Skipping feed seeder.",
    );
    return;
  }

  const citizens = await prisma.user.findMany({
    where: { email: { in: CITIZEN_EMAILS } },
  });
  const citizenByEmail = new Map(citizens.map((u) => [u.email, u]));
  const citizen = (email: string) =>
    citizenByEmail.get(email)?.id ?? fallbackUser.id;

  // Pull a spread of real, already-seeded entities so posts attach to actual
  // venues/gear/services/events/reviews/stamps instead of just the first row.
  const venues = await prisma.venue.findMany({
    take: 8,
    orderBy: { createdAt: "asc" },
  });
  const assets = await prisma.asset.findMany({
    take: 8,
    orderBy: { createdAt: "asc" },
  });
  const services = await prisma.service.findMany({
    take: 8,
    orderBy: { createdAt: "asc" },
  });
  const events = await prisma.event.findMany({
    take: 6,
    orderBy: { createdAt: "asc" },
  });
  const reviews = await prisma.review.findMany({
    take: 8,
    orderBy: { createdAt: "asc" },
  });
  const stamps = await prisma.passportStamp.findMany({
    take: 8,
    orderBy: { createdAt: "asc" },
  });

  const venue = (i: number) => venues[i % Math.max(venues.length, 1)];
  const asset = (i: number) => assets[i % Math.max(assets.length, 1)];
  const service = (i: number) => services[i % Math.max(services.length, 1)];
  const event = (i: number) => events[i % Math.max(events.length, 1)];
  const review = (i: number) => reviews[i % Math.max(reviews.length, 1)];
  const stamp = (i: number) => stamps[i % Math.max(stamps.length, 1)];

  const unsplash = (id: string) =>
    `https://images.unsplash.com/${id}?w=800&auto=format&fit=crop`;

  const postsData: Array<{
    id: string;
    authorId: string;
    type: PostType;
    tab: FeedTab;
    content: string;
    mediaUrls: string[];
    venueId?: string | null;
    assetId?: string | null;
    serviceId?: string | null;
    eventId?: string | null;
    reviewId?: string | null;
    stampId?: string | null;
    likesCount: number;
    commentsCount: number;
    isPinned?: boolean;
  }> = [
    // ── Citizen Experience (Community tab) ─────────────────────────────────
    {
      id: "seed-post-exp-makati",
      authorId: citizen("user@example.com"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Had an unforgettable creative workshop at Partner Creative Studio in Makati today! The acoustic setup, studio vibes, and staff hospitality made everything effortless. If you are looking for an intimate event space, highly recommended! 🦊✨",
      mediaUrls: [
        unsplash("photo-1511578314322-379afb476865"),
        unsplash("photo-1492684223066-81342ee5ff30"),
      ],
      venueId: venue(0)?.id ?? null,
      stampId: stamp(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
      isPinned: true,
    },
    {
      id: "seed-post-exp-baguio-trip",
      authorId: citizen("jasmine.reyes@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Weekend trip to Baguio for a friend's debut and the pine-forest venue completely stole the show. Cool weather, string lights, and the best halo-halo after. 10/10 would attend again. ❄️🌲",
      mediaUrls: [unsplash("photo-1476514525535-07fb3b4ae5f1")],
      venueId: venue(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-boracay-sunset",
      authorId: citizen("marco.santos@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Beachfront birthday dinner in Boracay with the whole squad. The sunset timed itself perfectly with the cake-cutting — didn't even need to plan the lighting. 🌅🎂",
      mediaUrls: [unsplash("photo-1507525428034-b723cf961d3e")],
      venueId: venue(2)?.id ?? null,
      stampId: stamp(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-esports-launch",
      authorId: citizen("gf-01@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "First time at a Nexus Esports Arena tournament as a spectator and the production value blew me away — casters, big screen replays, the works. Manila's gaming scene is leveling up fast. 🎮",
      mediaUrls: [unsplash("photo-1542751371-adc38448a05e")],
      venueId: venue(3)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-heritage-hall",
      authorId: citizen("sarah.lim@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Attended a lola's 80th birthday at a restored heritage hall in Manila — exposed brick, warm lighting, and a live rondalla band. Old Manila still has so much charm left in it. 🏛️",
      mediaUrls: [unsplash("photo-1519671482749-fd09be7ccebf")],
      venueId: venue(4)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-food-fest",
      authorId: citizen("sf-01@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Street food crawl turned into a full-blown outdoor food festival experience — every stall had its own sound system going. Chaotic but honestly the most fun I've had this quarter. 🌮🎶",
      mediaUrls: [unsplash("photo-1414235077428-338989a2e8c0")],
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-corporate-offsite",
      authorId: citizen("multirole@example.com"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Our team offsite at a boardroom-style venue in Ortigas actually got real work done for once — good wifi, good coffee, zero distractions. Corporate events don't have to be boring. ☕",
      mediaUrls: [unsplash("photo-1517502884422-41eaead166d4")],
      venueId: venue(5)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-exp-cebu-wedding",
      authorId: citizen("ef-01@foxers.ph"),
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Guest at a Cebu wedding reception this weekend — the coordinator had the whole run-of-show timed to the minute and it still felt relaxed. That's real event Foxer skill right there. 💍",
      mediaUrls: [unsplash("photo-1519741497674-611481863552")],
      venueId: venue(6)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Verified Review Share (Community tab) ──────────────────────────────
    {
      id: "seed-post-review-share",
      authorId: citizen("user@example.com"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Just dropped a 5-star review! The venue host was responsive from booking to pack-up. The sound gear was clean, setup was on point, and our guests loved the rooftop breeze.",
      mediaUrls: [unsplash("photo-1470225620780-dba8ba36b745")],
      reviewId: review(0)?.id ?? null,
      venueId: venue(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-review-share-2",
      authorId: citizen("jasmine.reyes@foxers.ph"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Left a review for the sound engineer we booked — showed up an hour early, no feedback issues all night, and helped us reshuffle the run sheet when a speaker ran late. Rebooking for sure.",
      mediaUrls: [],
      reviewId: review(1)?.id ?? null,
      serviceId: service(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-review-share-3",
      authorId: citizen("marco.santos@foxers.ph"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "5 stars for the gear rental — the projector arrived pre-tested with the right cables already in the case. Small thing but it saved us a very stressful hour.",
      mediaUrls: [unsplash("photo-1478720568477-152d9b164e26")],
      reviewId: review(2)?.id ?? null,
      assetId: asset(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-review-share-4",
      authorId: citizen("sarah.lim@foxers.ph"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Reviewed our venue for a 200-pax conference — smooth check-in, backup generator kicked in during a brownout without anyone noticing the lights flicker. Solid infra.",
      mediaUrls: [],
      reviewId: review(3)?.id ?? null,
      venueId: venue(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-review-share-5",
      authorId: citizen("multirole@example.com"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Wrote up a review after our product launch — the caterer read the room perfectly and quietly restocked the buffet before anyone had to ask. That's the kind of service worth shouting out.",
      mediaUrls: [unsplash("photo-1414235077428-338989a2e8c0")],
      reviewId: review(4)?.id ?? null,
      serviceId: service(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-review-share-6",
      authorId: citizen("gf-01@foxers.ph"),
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Booking review: the LED wall we rented had zero dead pixels and the vendor's tech stayed onsite the whole event just in case. Peace of mind is worth the extra fee.",
      mediaUrls: [],
      reviewId: review(5)?.id ?? null,
      assetId: asset(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Venue Spotlight (Marketplace tab) ───────────────────────────────────
    {
      id: "seed-post-venue-spotlight",
      authorId: venue(0)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `✨ SPOTLIGHT: ${venue(0)?.name ?? "Partner Creative Studio"} — currently open for weekend creative workshops, album launches, and brand pop-ups! Comes complete with 4K projection, club sound system, and prep kitchen. Message us for private viewings!`,
      mediaUrls: [
        unsplash("photo-1519167758481-83f550bb49b3"),
        unsplash("photo-1517457373958-b7bdd4587205"),
      ],
      venueId: venue(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-venue-spotlight-2",
      authorId: venue(1)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `📍 Now booking: ${venue(1)?.name ?? "our BGC space"} for Q1 socials and corporate mixers. Flexible layouts, in-house tech support, and a view that does half the decorating for you.`,
      mediaUrls: [unsplash("photo-1533105079780-92b9be482077")],
      venueId: venue(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-venue-spotlight-3",
      authorId: venue(2)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `🌴 ${venue(2)?.name ?? "Our beachfront venue"} has three open weekend slots left this season. Beachfront reception, in-house lifeguard, and a golden-hour view that photographs itself.`,
      mediaUrls: [unsplash("photo-1519046904884-53103b34b206")],
      venueId: venue(2)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-venue-spotlight-4",
      authorId: venue(3)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `🎮 ${venue(3)?.name ?? "Our esports arena"} is open for tournament bookings — dedicated fiber internet, production booth, and player lounges included. Tell your guild.`,
      mediaUrls: [unsplash("photo-1542751371-adc38448a05e")],
      venueId: venue(3)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-venue-spotlight-5",
      authorId: venue(4)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `🏛️ Heritage charm meets modern events: ${venue(4)?.name ?? "our heritage hall"} is available for intimate gatherings up to 180 guests. Exposed brick, warm lighting, zero compromise on comfort.`,
      mediaUrls: [unsplash("photo-1519671482749-fd09be7ccebf")],
      venueId: venue(4)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-venue-spotlight-6",
      authorId: venue(5)?.mayorId ?? partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content: `💼 Boardroom season is here — ${venue(5)?.name ?? "our Ortigas boardroom"} is fully booked most weekdays but still has Friday afternoon slots open for executive panels and pitch sessions.`,
      mediaUrls: [unsplash("photo-1517502884422-41eaead166d4")],
      venueId: venue(5)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Gear Offering (Marketplace tab) ─────────────────────────────────────
    {
      id: "seed-post-gear-offering",
      authorId: asset(0)?.ownerId ?? partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content:
        "⚡ GEAR READY FOR HIRE: Professional cold-spark machines & high-output silent generators available across Metro Manila. Fully tested, safe for indoor & outdoor ceremonies. Same-day logistics available.",
      mediaUrls: [unsplash("photo-1516873240891-4bf014598ab4")],
      assetId: asset(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-gear-offering-2",
      authorId: asset(1)?.ownerId ?? partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content: `🔊 ${asset(1)?.name ?? "Our line array speaker set"} just came back from servicing — booking now for December events. First come, first served.`,
      mediaUrls: [unsplash("photo-1598488035139-bdbb2231ce04")],
      assetId: asset(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-gear-offering-3",
      authorId: asset(2)?.ownerId ?? partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content: `💡 Moving-head lights and truss rigs available for weekend hire — ${asset(2)?.name ?? "full production package"} comes with a technician on standby.`,
      mediaUrls: [unsplash("photo-1470225620780-dba8ba36b745")],
      assetId: asset(2)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-gear-offering-4",
      authorId: asset(3)?.ownerId ?? partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content: `🪑 Chiavari chairs, banquet tables, and cocktail sets available in bulk — ${asset(3)?.name ?? "our furniture inventory"} covers weddings up to 300 pax.`,
      mediaUrls: [unsplash("photo-1519167758481-83f550bb49b3")],
      assetId: asset(3)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-gear-offering-5",
      authorId: asset(4)?.ownerId ?? partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content: `📽️ ${asset(4)?.name ?? "4K laser projector"} available for daylight presentations — 6000 lumens cuts through even the sunniest garden venue.`,
      mediaUrls: [unsplash("photo-1517457373958-b7bdd4587205")],
      assetId: asset(4)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Service Offering (Marketplace tab) ──────────────────────────────────
    {
      id: "seed-post-service-offering",
      authorId: service(0)?.ownerId ?? partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content:
        "🎧 Sound Engineering & Acoustic Setup: Experienced Foxer sound engineers available for live bands, corporate conferences, and electronic gigs. Full monitoring, mixdown, and on-site support included.",
      mediaUrls: [unsplash("photo-1598488035139-bdbb2231ce04")],
      serviceId: service(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-service-offering-2",
      authorId: service(1)?.ownerId ?? partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content: `📸 ${service(1)?.name ?? "Drone cinematography"} slots open for the rest of the quarter — aerial coverage for weddings, resort openings, and product shoots.`,
      mediaUrls: [unsplash("photo-1508614999368-9260051292e5")],
      serviceId: service(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-service-offering-3",
      authorId: service(2)?.ownerId ?? partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content: `🍸 ${service(2)?.name ?? "Artisanal cocktail mixology"} — custom menus, flair bartending, and full bar setup for 50-500 guests.`,
      mediaUrls: [unsplash("photo-1470337458703-46ad1756a187")],
      serviceId: service(2)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-service-offering-4",
      authorId: service(3)?.ownerId ?? partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content: `🎤 Looking for an MC who can actually read a room? ${service(3)?.name ?? "Our hosting service"} has bilingual hosts available for weddings, corporate events, and debuts.`,
      mediaUrls: [],
      serviceId: service(3)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-service-offering-5",
      authorId: service(4)?.ownerId ?? partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content: `🛡️ Licensed event security personnel available for crowd control and VIP escort — ${service(4)?.name ?? "our security team"} has covered concerts up to 5,000 attendees.`,
      mediaUrls: [unsplash("photo-1517502884422-41eaead166d4")],
      serviceId: service(4)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Event Announcement (Marketplace tab) ────────────────────────────────
    {
      id: "seed-post-event-announcement",
      authorId: event(0)?.organizerId ?? partner.id,
      type: PostType.event_announcement,
      tab: FeedTab.marketplace,
      content:
        "🎉 ANNOUNCEMENT: Manila Indie Sound Sessions Vol. 4! Featuring 6 indie artists, craft food stalls, and an immersive neon setup. Limited early-bird passes are now live. Grab your tickets below!",
      mediaUrls: [
        unsplash("photo-1501386761578-eac5c94b800a"),
        unsplash("photo-1429962714451-bb934ecdc4ec"),
      ],
      eventId: event(0)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
      isPinned: true,
    },
    {
      id: "seed-post-event-announcement-2",
      authorId: event(1)?.organizerId ?? partner.id,
      type: PostType.event_announcement,
      tab: FeedTab.marketplace,
      content: `📅 ${event(1)?.name ?? "Our next event"} is officially open for RSVPs — limited slots for this one, so lock yours in early.`,
      mediaUrls: [unsplash("photo-1511578314322-379afb476865")],
      eventId: event(1)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-event-announcement-3",
      authorId: event(2)?.organizerId ?? partner.id,
      type: PostType.event_announcement,
      tab: FeedTab.marketplace,
      content: `🏆 Registrations for ${event(2)?.name ?? "our gaming championship"} are now open — bracket seeding starts next week, don't sleep on it.`,
      mediaUrls: [unsplash("photo-1542751371-adc38448a05e")],
      eventId: event(2)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-event-announcement-4",
      authorId: event(3)?.organizerId ?? partner.id,
      type: PostType.event_announcement,
      tab: FeedTab.marketplace,
      content: `🎨 ${event(3)?.name ?? "Our art showcase"} lineup just dropped — 12 local artists, one night only. Tickets move fast for this series.`,
      mediaUrls: [unsplash("photo-1470225620780-dba8ba36b745")],
      eventId: event(3)?.id ?? null,
      likesCount: 0,
      commentsCount: 0,
    },

    // ── Partner Announcement (Partners tab) ─────────────────────────────────
    {
      id: "seed-post-partner-announcement",
      authorId: partner.id,
      type: PostType.partner_announcement,
      tab: FeedTab.partners,
      content:
        "🤝 PARTNER FOXER BACKING CALL: Fox Partner is actively sponsoring 3 independent cultural events this upcoming quarter! We provide free venue access, sound rigs, and up to ₱50,000 in co-production support. Event Foxers and community organizers, click Contact Partner to submit your pitch!",
      mediaUrls: [unsplash("photo-1511795409834-ef04bbd61622")],
      likesCount: 0,
      commentsCount: 0,
      isPinned: true,
    },
    {
      id: "seed-post-partner-announcement-2",
      authorId: partner.id,
      type: PostType.partner_announcement,
      tab: FeedTab.partners,
      content:
        "📦 New equipment depot now live in Quezon City! Stage trusses, LED walls, and silent generators available for pooled hire across nearby venues — check the investment map for real-time stock.",
      mediaUrls: [unsplash("photo-1516873240891-4bf014598ab4")],
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: "seed-post-partner-announcement-3",
      authorId: partner.id,
      type: PostType.partner_announcement,
      tab: FeedTab.partners,
      content:
        "💰 Capital allocation update: ₱2M committed this quarter across venue upgrades and gear procurement for partner-network Foxers. Reach out if you're scaling up and need backing.",
      mediaUrls: [],
      likesCount: 0,
      commentsCount: 0,
    },
  ];

  for (const p of postsData) {
    await prisma.post.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }

  // Ensure every user (except system admins) has at least one post
  const allUsers = await prisma.user.findMany();
  const authorsSoFar = new Set(postsData.map((p) => p.authorId));

  const extraPosts = [];
  let extraCount = 0;
  for (const u of allUsers) {
    if (
      !authorsSoFar.has(u.id) &&
      u.systemRole !== "admin" &&
      u.systemRole !== "admin_secretary"
    ) {
      const extraPost = {
        id: `seed-post-auto-${u.username || ++extraCount}`,
        authorId: u.id,
        type: PostType.citizen_experience,
        tab: FeedTab.community,
        content: `Just checking in to the Republic! Really excited to see what events and spaces people are sharing here. 🦊✨`,
        mediaUrls: [],
        likesCount: 0,
        commentsCount: 0,
      };
      extraPosts.push(extraPost);
    }
  }

  for (const p of extraPosts) {
    await prisma.post.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
    postsData.push(p);
  }

  // ── Likes: real PostLike rows (not just a counter) ───────────────────────
  // A deterministic-but-varied subset of the known citizens/foxers "likes"
  // each post, so isLikedByMe and like lists actually resolve to something
  // when browsing the feed as any of these seeded accounts.
  const likerPool = [...citizens.map((u) => u.id), partner.id, fallbackUser.id];

  for (let i = 0; i < postsData.length; i++) {
    const p = postsData[i];
    // Rotate through the pool so each post gets a different-looking set of
    // likers, with later posts (pinned announcements) getting more likes.
    const likeCount = p.isPinned ? Math.min(likerPool.length, 6) : 2 + (i % 4);
    const likers = new Set<string>();
    for (let k = 0; k < likeCount; k++) {
      likers.add(likerPool[(i + k) % likerPool.length]);
    }
    // Never let a post "like" itself in a way that looks like self-promotion
    // spam — drop the author from their own like list.
    likers.delete(p.authorId);

    for (const userId of likers) {
      await prisma.postLike.upsert({
        where: { postId_userId: { postId: p.id, userId } },
        update: {},
        create: { postId: p.id, userId },
      });
    }

    await prisma.post.update({
      where: { id: p.id },
      data: { likesCount: likers.size },
    });
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  const sampleComments = [
    {
      id: "seed-comment-1",
      postId: "seed-post-partner-announcement",
      authorId: citizen("jasmine.reyes@foxers.ph"),
      content:
        "This is huge! We're putting together a community film screening in BGC. Will reach out via chat!",
    },
    {
      id: "seed-comment-2",
      postId: "seed-post-venue-spotlight",
      authorId: citizen("user@example.com"),
      content: "Do you allow external caterers for Saturday afternoon events?",
    },
    {
      id: "seed-comment-3",
      postId: "seed-post-exp-makati",
      authorId: partner.id,
      content:
        "Thanks for celebrating with us! You are always welcome back at the Creative Studio! 🦊",
    },
    {
      id: "seed-comment-4",
      postId: "seed-post-exp-boracay-sunset",
      authorId: citizen("marco.santos@foxers.ph"),
      content: "The timing on that sunset shot is unreal, no filter needed 😍",
    },
    {
      id: "seed-comment-5",
      postId: "seed-post-event-announcement",
      authorId: citizen("sarah.lim@foxers.ph"),
      content: "Already got my early bird ticket, see everyone there!",
    },
    {
      id: "seed-comment-6",
      postId: "seed-post-gear-offering",
      authorId: citizen("gf-01@foxers.ph"),
      content:
        "Do the generators come with a spare fuel tank for overnight events?",
    },
    {
      id: "seed-comment-7",
      postId: "seed-post-service-offering",
      authorId: citizen("multirole@example.com"),
      content: "Booked you guys for our December mixer, can't wait!",
    },
    {
      id: "seed-comment-8",
      postId: "seed-post-review-share-2",
      authorId: citizen("sf-01@foxers.ph"),
      content:
        "Same engineer worked our launch too, genuinely great under pressure.",
    },
    {
      id: "seed-comment-9",
      postId: "seed-post-partner-announcement-2",
      authorId: citizen("ef-01@foxers.ph"),
      content: "Does the QC depot deliver to venues outside Metro Manila?",
    },
    {
      id: "seed-comment-10",
      postId: "seed-post-exp-cebu-wedding",
      authorId: citizen("jasmine.reyes@foxers.ph"),
      content: "Cebu weddings really do hit different, that ocean backdrop 😭",
    },
    {
      id: "seed-comment-11",
      postId: "seed-post-venue-spotlight-3",
      authorId: citizen("marco.santos@foxers.ph"),
      content: "What's the rain contingency plan for the beachfront reception?",
    },
    {
      id: "seed-comment-12",
      postId: "seed-post-event-announcement-3",
      authorId: citizen("gf-01@foxers.ph"),
      content:
        "Signing up my squad right now, been waiting for this bracket all year.",
    },
    {
      id: "seed-comment-13",
      postId: "seed-post-review-share",
      authorId: citizen("sarah.lim@foxers.ph"),
      content:
        "Glad it worked out — that rooftop really does catch a good breeze.",
    },
    {
      id: "seed-comment-14",
      postId: "seed-post-gear-offering-2",
      authorId: partner.id,
      content: "Booking window for December closes end of this week, heads up!",
    },
    {
      id: "seed-comment-15",
      postId: "seed-post-exp-heritage-hall",
      authorId: citizen("user@example.com"),
      content:
        "That exposed brick + warm lighting combo is so underrated for events.",
    },
    {
      id: "seed-comment-16",
      postId: "seed-post-service-offering-2",
      authorId: citizen("sf-01@foxers.ph"),
      content:
        "Your resort opening reel is what convinced me to book aerial coverage!",
    },
    {
      id: "seed-comment-17",
      postId: "seed-post-partner-announcement-3",
      authorId: citizen("multirole@example.com"),
      content: "Sent over our pitch deck, hoping to hear back this quarter.",
    },
  ];

  for (const c of sampleComments) {
    await prisma.postComment.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  for (const postId of new Set(sampleComments.map((c) => c.postId))) {
    const count = sampleComments.filter((c) => c.postId === postId).length;
    await prisma.post.update({
      where: { id: postId },
      data: { commentsCount: count },
    });
  }

  console.log(
    `✓ Seeded ${postsData.length} Republic Foxer posts, ${sampleComments.length} comments, and real likes across ${likerPool.length} accounts.`,
  );
}

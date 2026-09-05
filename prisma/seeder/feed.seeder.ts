import { PrismaClient, PostType, FeedTab } from "@prisma/client";

export async function seedFeed(prisma: PrismaClient) {
  console.log("Seeding Republic Foxer feed...");

  const partner = await prisma.user.findUnique({
    where: { email: "partner@example.com" },
  });
  const user1 = await prisma.user.findFirst({
    where: { email: { not: "partner@example.com" } },
  });

  if (!partner || !user1) {
    console.warn("⚠️ Cannot seed feed: partner or user not found. Skipping feed seeder.");
    return;
  }

  // Find sample entities to link
  const sampleVenue = await prisma.venue.findFirst({
    where: { mayorId: partner.id },
  });
  const sampleAsset = await prisma.asset.findFirst();
  const sampleService = await prisma.service.findFirst();
  const sampleEvent = await prisma.event.findFirst();
  const sampleReview = await prisma.review.findFirst({
    where: { userId: user1.id },
  });
  const sampleStamp = await prisma.passportStamp.findFirst({
    where: { passport: { userId: user1.id } },
  });

  const postsData = [
    // 1. Citizen Experience (Community Tab)
    {
      id: "seed-post-exp-makati",
      authorId: user1.id,
      type: PostType.citizen_experience,
      tab: FeedTab.community,
      content:
        "Had an unforgettable creative workshop at Partner Creative Studio in Makati today! The acoustic setup, studio vibes, and staff hospitality made everything effortless. If you are looking for an intimate event space, highly recommended! 🦊✨",
      mediaUrls: [
        "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop",
      ],
      venueId: sampleVenue?.id ?? null,
      stampId: sampleStamp?.id ?? null,
      likesCount: 14,
      commentsCount: 3,
      isPinned: true,
    },
    // 2. Verified Review Share (Community Tab)
    {
      id: "seed-post-review-share",
      authorId: user1.id,
      type: PostType.review_share,
      tab: FeedTab.community,
      content:
        "Just dropped a 5-star review! The venue host was responsive from booking to pack-up. The sound gear was clean, setup was on point, and our guests loved the rooftop breeze.",
      mediaUrls: [
        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop",
      ],
      reviewId: sampleReview?.id ?? null,
      venueId: sampleVenue?.id ?? null,
      likesCount: 9,
      commentsCount: 2,
    },
    // 3. Venue Spotlight (Marketplace Tab)
    {
      id: "seed-post-venue-spotlight",
      authorId: partner.id,
      type: PostType.venue_spotlight,
      tab: FeedTab.marketplace,
      content:
        "✨ SPOTLIGHT: Partner Creative Studio — Makati. Currently open for weekend creative workshops, album launches, and brand pop-ups! Comes complete with 4K projection, club sound system, and prep kitchen. Message us for private viewings!",
      mediaUrls: [
        "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&auto=format&fit=crop",
      ],
      venueId: sampleVenue?.id ?? null,
      likesCount: 28,
      commentsCount: 5,
    },
    // 4. Gear Offering (Marketplace Tab)
    {
      id: "seed-post-gear-offering",
      authorId: partner.id,
      type: PostType.gear_offering,
      tab: FeedTab.marketplace,
      content:
        "⚡ GEAR READY FOR HIRE: Professional cold-spark machines & high-output silent generators available across Metro Manila. Fully tested, safe for indoor & outdoor ceremonies. Same-day logistics available.",
      mediaUrls: [
        "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800&auto=format&fit=crop",
      ],
      assetId: sampleAsset?.id ?? null,
      likesCount: 19,
      commentsCount: 4,
    },
    // 5. Service Offering (Marketplace Tab)
    {
      id: "seed-post-service-offering",
      authorId: partner.id,
      type: PostType.service_offering,
      tab: FeedTab.marketplace,
      content:
        "🎧 Sound Engineering & Acoustic Setup: Experienced Foxer sound engineers available for live bands, corporate conferences, and electronic gigs. Full monitoring, mixdown, and on-site support included.",
      mediaUrls: [
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop",
      ],
      serviceId: sampleService?.id ?? null,
      likesCount: 16,
      commentsCount: 2,
    },
    // 6. Event Announcement (Marketplace Tab)
    {
      id: "seed-post-event-announcement",
      authorId: partner.id,
      type: PostType.event_announcement,
      tab: FeedTab.marketplace,
      content:
        "🎉 ANNOUNCEMENT: Manila Indie Sound Sessions Vol. 4! Featuring 6 indie artists, craft food stalls, and an immersive neon setup. Limited early-bird passes are now live. Grab your tickets below!",
      mediaUrls: [
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&auto=format&fit=crop",
      ],
      eventId: sampleEvent?.id ?? null,
      likesCount: 42,
      commentsCount: 8,
      isPinned: true,
    },
    // 7. Partner Announcement (Partners Tab)
    {
      id: "seed-post-partner-announcement",
      authorId: partner.id,
      type: PostType.partner_announcement,
      tab: FeedTab.partners,
      content:
        "🤝 PARTNER FOXER BACKING CALL: Fox Partner is actively sponsoring 3 independent cultural events this upcoming quarter! We provide free venue access, sound rigs, and up to ₱50,000 in co-production support. Event Foxers and community organizers, click Contact Partner to submit your pitch!",
      mediaUrls: [
        "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop",
      ],
      likesCount: 65,
      commentsCount: 11,
      isPinned: true,
    },
  ];

  for (const p of postsData) {
    await prisma.post.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }

  // Add sample comments to make the feed interactive
  const sampleComments = [
    {
      id: "seed-comment-1",
      postId: "seed-post-partner-announcement",
      authorId: user1.id,
      content: "This is huge! We're putting together a community film screening in BGC. Will reach out via chat!",
    },
    {
      id: "seed-comment-2",
      postId: "seed-post-venue-spotlight",
      authorId: user1.id,
      content: "Do you allow external caterers for Saturday afternoon events?",
    },
    {
      id: "seed-comment-3",
      postId: "seed-post-exp-makati",
      authorId: partner.id,
      content: "Thanks for celebrating with us! You are always welcome back at the Creative Studio! 🦊",
    },
  ];

  for (const c of sampleComments) {
    await prisma.postComment.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  console.log(`✓ Seeded ${postsData.length} Republic Foxer posts and sample comments.`);
}

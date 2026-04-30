import { PrismaClient } from "@prisma/client";

const VENUE_IDS = {
  palace: "seed-venue-grand-palace-hall",
  gazebo: "seed-venue-garden-gazebo",
  boracay: "seed-venue-boracay-beach-resort",
  loft: "seed-venue-the-loft-bgc",
};

const EVENT_IDS = {
  birthday: "seed-event-birthday-01",
  corporate: "seed-event-corporate-01",
  social: "seed-event-social-01",
};

export async function seedReviews(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting review seed...");

    const regularUser  = users.find((u) => u.email === "user@example.com");
    const gearFoxer    = users.find((u) => u.email === "gearfoxer@example.com");
    const multiRole    = users.find((u) => u.email === "multirole@example.com");
    const jasmine      = users.find((u) => u.email === "jasmine.reyes@foxers.ph");
    const marco        = users.find((u) => u.email === "marco.santos@foxers.ph");

    if (!regularUser) throw new Error("user@example.com not found for review seeding");

    // Each (userId, entityId, entityType) must be unique
    const reviews = [
      // ── Grand Palace Hall ─────────────────────────────────────────────────
      {
        id: "seed-review-palace-1",
        userId: regularUser.id,
        entityId: VENUE_IDS.palace,
        entityType: "venue",
        rating: 5,
        comment: "Grand Palace Hall is absolutely breathtaking. The lighting, the space, and the team — everything was flawless for our event.",
      },
      ...(gearFoxer ? [{
        id: "seed-review-palace-2",
        userId: gearFoxer.id,
        entityId: VENUE_IDS.palace,
        entityType: "venue",
        rating: 5,
        comment: "One of the best venues in Manila. Excellent facilities and the staff went above and beyond.",
      }] : []),

      // ── The Loft BGC ──────────────────────────────────────────────────────
      {
        id: "seed-review-loft-1",
        userId: regularUser.id,
        entityId: VENUE_IDS.loft,
        entityType: "venue",
        rating: 4,
        comment: "The Loft BGC has a great vibe for corporate events. Modern design and the rooftop view is incredible at night.",
      },
      ...(multiRole ? [{
        id: "seed-review-loft-2",
        userId: multiRole.id,
        entityId: VENUE_IDS.loft,
        entityType: "venue",
        rating: 5,
        comment: "Booked for a product launch — highly recommend. The AV setup was top-tier and the concierge was super helpful.",
      }] : []),

      // ── Boracay Beach Resort ──────────────────────────────────────────────
      {
        id: "seed-review-boracay-1",
        userId: regularUser.id,
        entityId: VENUE_IDS.boracay,
        entityType: "venue",
        rating: 5,
        comment: "Our beach wedding was a dream. The sunset backdrop was out of this world. Worth every peso.",
      },
      ...(jasmine ? [{
        id: "seed-review-boracay-2",
        userId: jasmine.id,
        entityId: VENUE_IDS.boracay,
        entityType: "venue",
        rating: 4,
        comment: "Beautiful resort venue. Logistics were smooth, staff was accommodating. Slight issue with parking but nothing that ruined the day.",
      }] : []),

      // ── Garden Gazebo ─────────────────────────────────────────────────────
      {
        id: "seed-review-gazebo-1",
        userId: regularUser.id,
        entityId: VENUE_IDS.gazebo,
        entityType: "venue",
        rating: 5,
        comment: "Perfect for an intimate garden party. The lights at night made everything so magical. Will definitely come back.",
      },
      ...(marco ? [{
        id: "seed-review-gazebo-2",
        userId: marco.id,
        entityId: VENUE_IDS.gazebo,
        entityType: "venue",
        rating: 4,
        comment: "Charming outdoor venue. The gazebo setup was elegant and the staff was very attentive.",
      }] : []),

      // ── Event Reviews ─────────────────────────────────────────────────────
      {
        id: "seed-review-event-birthday",
        userId: regularUser.id,
        entityId: EVENT_IDS.birthday,
        entityType: "event",
        rating: 5,
        comment: "Best birthday party I've ever attended! The decor, food, and live band were all incredible. The team nailed every detail.",
      },
      {
        id: "seed-review-event-corporate",
        userId: regularUser.id,
        entityId: EVENT_IDS.corporate,
        entityType: "event",
        rating: 4,
        comment: "Great corporate summit experience. Very professional setup. The catering was top-notch and the AV never had any hiccups.",
      },
      {
        id: "seed-review-event-social",
        userId: regularUser.id,
        entityId: EVENT_IDS.social,
        entityType: "event",
        rating: 5,
        comment: "The Summer Rooftop Social was absolutely fire! Live music + great vibes + beautiful night sky. 10/10 would attend again.",
      },
    ];

    for (const r of reviews) {
      const { id, ...data } = r;
      await prisma.review.upsert({
        where: { id },
        update: { rating: data.rating, comment: data.comment },
        create: { id, ...data },
      });
      console.log(`✓ Seeded review: ${r.entityType} ${r.entityId} (${r.rating}★)`);
    }

    console.log("✅ Review seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding reviews:", error);
    throw error;
  }
}

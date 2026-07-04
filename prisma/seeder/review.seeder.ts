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

    // One review per bookingId (unique constraint)
    const reviews = [
      // ── Grand Palace Hall ─────────────────────────────────────────────────
      {
        id: "seed-review-palace-1",
        userId: regularUser.id,
        bookingId: "seed-booking-birthday-01",
        entityId: VENUE_IDS.palace,
        entityType: "venue",
        rating: 5,
        comment: "Grand Palace Hall is absolutely breathtaking. The lighting, the space, and the team — everything was flawless for our event.",
      },
      ...(gearFoxer ? [{
        id: "seed-review-palace-2",
        userId: gearFoxer.id,
        bookingId: "seed-booking-may-birthday-02",
        entityId: VENUE_IDS.palace,
        entityType: "venue",
        rating: 5,
        comment: "One of the best venues in Manila. Excellent facilities and the staff went above and beyond.",
      }] : []),

      // ── The Loft BGC ──────────────────────────────────────────────────────
      {
        id: "seed-review-loft-1",
        userId: regularUser.id,
        bookingId: "seed-booking-corporate-01",
        entityId: VENUE_IDS.loft,
        entityType: "venue",
        rating: 4,
        comment: "The Loft BGC has a great vibe for corporate events. Modern design and the rooftop view is incredible at night.",
      },
      ...(multiRole ? [{
        id: "seed-review-loft-2",
        userId: multiRole.id,
        bookingId: "seed-booking-may-corporate-01",
        entityId: VENUE_IDS.loft,
        entityType: "venue",
        rating: 5,
        comment: "Booked for a product launch — highly recommend. The AV setup was top-tier and the concierge was super helpful.",
      }] : []),

      // ── Boracay Beach Resort ──────────────────────────────────────────────
      {
        id: "seed-review-boracay-1",
        userId: regularUser.id,
        bookingId: "seed-booking-may-wedding-01",
        entityId: VENUE_IDS.boracay,
        entityType: "venue",
        rating: 5,
        comment: "Our beach wedding was a dream. The sunset backdrop was out of this world. Worth every peso.",
      },

      // ── Garden Gazebo ─────────────────────────────────────────────────────
      {
        id: "seed-review-gazebo-1",
        userId: regularUser.id,
        bookingId: "seed-booking-may-birthday-01",
        entityId: VENUE_IDS.gazebo,
        entityType: "venue",
        rating: 5,
        comment: "Perfect for an intimate garden party. The lights at night made everything so magical. Will definitely come back.",
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

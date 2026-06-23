import { PrismaClient, ItemBookingStatus, PaymentStatus } from "@prisma/client";

export async function seedItemBookings(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting item booking seed...");

    const citizen = users.find(u => u.email === "user@example.com");
    const host    = users.find(u => u.email === "host@example.com");

    if (!citizen) throw new Error("Citizen user not found for item booking seeding");
    if (!host)    throw new Error("Host user not found for item booking seeding");

    // ── Service Bookings — May 2026 (visible on calendar for testing) ─────────
    const mayServiceBookings = [
      {
        id: "seed-sbooking-may-photography",
        serviceId: "seed-service-manila-event-photography",
        userId: citizen.id,
        scheduledDate: new Date("2026-05-10T08:00:00.000Z"),
        endDate: new Date("2026-05-10T18:00:00.000Z"),
        guestCount: 60,
        location: "Laguna Garden Resort, Santa Rosa",
        notes: "Debut party. Full coverage.",
        totalAmount: 15000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_may_photo_001",
        paymentMethod: "card",
      },
      {
        id: "seed-sbooking-may-liveband-1",
        serviceId: "seed-service-live-band-performance",
        userId: host.id,
        scheduledDate: new Date("2026-05-16T18:00:00.000Z"),
        endDate: new Date("2026-05-16T23:00:00.000Z"),
        guestCount: 200,
        location: "BGC Arts Center, Taguig",
        notes: "Anniversary gala. Classic and jazz set.",
        totalAmount: 30000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_may_band_001",
        paymentMethod: "card",
      },
      {
        id: "seed-sbooking-may-liveband-2",
        serviceId: "seed-service-live-band-performance",
        userId: citizen.id,
        scheduledDate: new Date("2026-05-23T17:00:00.000Z"),
        endDate: new Date("2026-05-23T22:00:00.000Z"),
        guestCount: 120,
        location: "Solaire Resort, Parañaque",
        notes: "Company year-end party.",
        totalAmount: 28000,
        status: ItemBookingStatus.pending,
        paymentStatus: PaymentStatus.pending,
      },
      {
        id: "seed-sbooking-may-catering",
        serviceId: "seed-service-metro-manila-premium-catering",
        userId: host.id,
        scheduledDate: new Date("2026-05-28T10:00:00.000Z"),
        endDate: new Date("2026-05-28T20:00:00.000Z"),
        guestCount: 180,
        location: "Makati Shangri-La Ballroom",
        notes: "Wedding reception. Plated 5-course meal.",
        totalAmount: 90000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_may_cater_001",
        paymentMethod: "card",
      },
    ];

    for (const sb of mayServiceBookings) {
      await prisma.serviceBooking.upsert({
        where: { id: sb.id },
        update: { scheduledDate: sb.scheduledDate, endDate: sb.endDate, status: sb.status },
        create: sb,
      });
      console.log(`✓ Seeded May service booking: ${sb.id}`);
    }

    // ── Service Bookings ──────────────────────────────────────────────────────
    const serviceBookings = [
      {
        id: "seed-sbooking-jasmine-event",
        serviceId: "seed-service-jasmine-event-production",
        userId: citizen.id,
        scheduledDate: new Date("2026-06-15T08:00:00.000Z"),
        endDate: new Date("2026-06-15T20:00:00.000Z"),
        guestCount: 80,
        location: "The Ruins, Batangas",
        notes: "Boho garden wedding vibe. Would love pampas grass and dried florals.",
        totalAmount: 35000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_svc_jasmine_001",
        paymentMethod: "card",
      },
      {
        id: "seed-sbooking-sarah-dj",
        serviceId: "seed-service-sarah-dj-set",
        userId: host.id,
        scheduledDate: new Date("2026-07-04T20:00:00.000Z"),
        endDate: new Date("2026-07-05T02:00:00.000Z"),
        guestCount: 150,
        location: "Azul Beach Club, Batangas",
        notes: "Beach party. Mix of tropical house and R&B. Start sunset, end midnight.",
        totalAmount: 20000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_svc_sarah_001",
        paymentMethod: "card",
      },
      {
        id: "seed-sbooking-marco-trek",
        serviceId: "seed-service-marco-live-trekking",
        userId: citizen.id,
        scheduledDate: new Date("2026-06-28T05:00:00.000Z"),
        endDate: new Date("2026-06-28T17:00:00.000Z"),
        guestCount: 12,
        location: "Mt. Pulag, Benguet",
        notes: "Corporate offsite team building. 12 participants, mixed fitness levels.",
        totalAmount: 42000,
        status: ItemBookingStatus.pending,
        paymentStatus: PaymentStatus.pending,
      },
      {
        id: "seed-sbooking-gear-lacoustics",
        serviceId: "seed-service-gear-lacoustics-sound",
        userId: host.id,
        scheduledDate: new Date("2026-08-10T14:00:00.000Z"),
        endDate: new Date("2026-08-10T23:00:00.000Z"),
        guestCount: 300,
        location: "Circuit Makati Open Grounds",
        notes: "Outdoor festival. Need full PA and monitor wedges.",
        totalAmount: 28000,
        status: ItemBookingStatus.active,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_svc_gear_001",
        paymentMethod: "card",
      },
    ];

    for (const sb of serviceBookings) {
      await prisma.serviceBooking.upsert({
        where: { id: sb.id },
        update: {},
        create: sb,
      });
      console.log(`✓ Seeded service booking: ${sb.id}`);
    }

    // ── Asset Bookings — May 2026 (visible on calendar for testing) ──────────
    const mayAssetBookings = [
      {
        id: "seed-abooking-may-speakers",
        assetId: "seed-asset-stage-speakers-xl",
        userId: citizen.id,
        startDate: new Date("2026-05-09T08:00:00.000Z"),
        endDate: new Date("2026-05-11T20:00:00.000Z"),   // May 9–11 blocked
        quantity: 2,
        fulfillmentType: "delivery",
        deliveryAddress: "SM Mall of Asia Arena, Pasay",
        notes: "3-day trade expo. Full conference PA.",
        totalAmount: 12000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_may_spk_001",
        paymentMethod: "card",
      },
      {
        id: "seed-abooking-may-led",
        assetId: "seed-asset-led-flood-lights-rgb",
        userId: host.id,
        startDate: new Date("2026-05-17T10:00:00.000Z"),
        endDate: new Date("2026-05-19T10:00:00.000Z"),   // May 17–19 blocked
        quantity: 8,
        fulfillmentType: "pickup",
        notes: "Music festival. Full stage wash.",
        totalAmount: 6000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_may_led_001",
        paymentMethod: "card",
      },
      {
        id: "seed-abooking-may-lavalier",
        assetId: "seed-asset-wireless-lavalier-mic-set",
        userId: citizen.id,
        startDate: new Date("2026-05-22T09:00:00.000Z"),
        endDate: new Date("2026-05-22T18:00:00.000Z"),   // May 22 blocked
        quantity: 4,
        fulfillmentType: "delivery",
        deliveryAddress: "Ateneo de Manila University, Quezon City",
        notes: "Commencement ceremonies.",
        totalAmount: 4000,
        status: ItemBookingStatus.pending,
        paymentStatus: PaymentStatus.pending,
      },
    ];

    for (const ab of mayAssetBookings) {
      await prisma.assetBooking.upsert({
        where: { id: ab.id },
        update: { startDate: ab.startDate, endDate: ab.endDate, status: ab.status },
        create: ab,
      });
      console.log(`✓ Seeded May asset booking: ${ab.id}`);
    }

    // ── Asset Bookings ────────────────────────────────────────────────────────
    const assetBookings = [
      {
        id: "seed-abooking-speakers-xl",
        assetId: "seed-asset-stage-speakers-xl",
        userId: citizen.id,
        startDate: new Date("2026-06-20T08:00:00.000Z"),
        endDate: new Date("2026-06-22T20:00:00.000Z"),
        quantity: 2,
        fulfillmentType: "delivery",
        deliveryAddress: "123 Rizal Ave, Makati City, Metro Manila",
        notes: "3-day corporate conference. Delivery by 8am Day 1.",
        totalAmount: 12000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_asset_spk_001",
        paymentMethod: "card",
      },
      {
        id: "seed-abooking-led-lights",
        assetId: "seed-asset-led-flood-lights-rgb",
        userId: host.id,
        startDate: new Date("2026-07-12T10:00:00.000Z"),
        endDate: new Date("2026-07-13T10:00:00.000Z"),
        quantity: 6,
        fulfillmentType: "pickup",
        notes: "Night event. Will pick up from QC warehouse by 10am.",
        totalAmount: 3000,
        status: ItemBookingStatus.completed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_asset_led_001",
        paymentMethod: "card",
      },
      {
        id: "seed-abooking-floral-arch",
        assetId: "seed-asset-floral-arch-setup",
        userId: citizen.id,
        startDate: new Date("2026-08-05T07:00:00.000Z"),
        endDate: new Date("2026-08-05T22:00:00.000Z"),
        quantity: 1,
        fulfillmentType: "delivery",
        deliveryAddress: "456 Bulacan Road, Malolos, Bulacan",
        notes: "Debut party. White and blush pink color scheme preferred.",
        totalAmount: 3500,
        status: ItemBookingStatus.pending,
        paymentStatus: PaymentStatus.pending,
      },
      {
        id: "seed-abooking-tiffany-chairs",
        assetId: "seed-asset-tiffany-chairs-(set-of-50)",
        userId: host.id,
        startDate: new Date("2026-09-20T06:00:00.000Z"),
        endDate: new Date("2026-09-21T12:00:00.000Z"),
        quantity: 50,
        fulfillmentType: "delivery",
        deliveryAddress: "789 Venue Blvd, Pasig City, Metro Manila",
        notes: "Wedding reception. Please deliver fully assembled.",
        totalAmount: 3000,
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: "pi_seed_asset_chairs_001",
        paymentMethod: "card",
      },
    ];

    for (const ab of assetBookings) {
      await prisma.assetBooking.upsert({
        where: { id: ab.id },
        update: {},
        create: ab,
      });
      console.log(`✓ Seeded asset booking: ${ab.id}`);
    }

    console.log("✅ Item booking seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding item bookings:", error);
    throw error;
  }
}

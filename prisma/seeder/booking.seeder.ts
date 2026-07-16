import { PrismaClient, BookingStatus, PaymentStatus, PaymentType, EventCategory, EventStatus, RequestStatus } from "@prisma/client";

export async function seedBookings(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting booking seed...");

    const client  = users.find(u => u.email === "user@example.com");
    const host    = users.find(u => u.email === "host@example.com");
    const jasmine = users.find(u => u.email === "jasmine.reyes@foxers.ph");
    const marco   = users.find(u => u.email === "marco.santos@foxers.ph");
    const sarah   = users.find(u => u.email === "sarah.lim@foxers.ph");
    const multi   = users.find(u => u.email === "multirole@example.com");
    if (!client) throw new Error("user@example.com not found for booking seeding");
    if (!host)   throw new Error("host@example.com not found for booking seeding");

    // ── May 2026 events (from templates) — visible on the availability calendar ──
    const mayEvents = [
      {
        id: "seed-event-may-birthday-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-birthday",
        name: "Santos Birthday Bash",
        description: "Birthday party booking from template",
        eventCategory: EventCategory.birthday,
        startAt: new Date("2026-05-07T18:00:00.000Z"),
        endAt:   new Date("2026-05-08T00:00:00.000Z"),
        guestCount: 60,
        totalAmount: 35150,
        eventStatus: EventStatus.pending,
        requestStatus: RequestStatus.approved,
        targetCity: "Quezon City",
        targetState: "Metro Manila",
      },
      {
        id: "seed-event-may-birthday-02",
        clientId: host.id,
        organizerId: host.id,
        templateId: "seed-template-birthday",
        name: "Reyes Surprise Party",
        description: "Surprise birthday from template",
        eventCategory: EventCategory.birthday,
        startAt: new Date("2026-05-14T17:00:00.000Z"),
        endAt:   new Date("2026-05-14T23:00:00.000Z"),
        guestCount: 40,
        totalAmount: 35150,
        eventStatus: EventStatus.pending,
        requestStatus: RequestStatus.approved,
        targetCity: "Pasig City",
        targetState: "Metro Manila",
      },
      {
        id: "seed-event-may-wedding-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-wedding",
        name: "Cruz-Dela Rosa Wedding",
        description: "Garden wedding booking from template",
        eventCategory: EventCategory.wedding,
        startAt: new Date("2026-05-20T10:00:00.000Z"),
        endAt:   new Date("2026-05-20T22:00:00.000Z"),
        guestCount: 150,
        totalAmount: 85150,
        eventStatus: EventStatus.pending,
        requestStatus: RequestStatus.approved,
        targetCity: "Tagaytay",
        targetState: "Cavite",
      },
      {
        id: "seed-event-may-corporate-01",
        clientId: host.id,
        organizerId: host.id,
        templateId: "seed-template-corporate",
        name: "Acme Corp Q2 Summit",
        description: "Corporate summit from template",
        eventCategory: EventCategory.corporate,
        startAt: new Date("2026-05-27T08:00:00.000Z"),
        endAt:   new Date("2026-05-27T18:00:00.000Z"),
        guestCount: 80,
        totalAmount: 60150,
        eventStatus: EventStatus.pending,
        requestStatus: RequestStatus.approved,
        targetCity: "Makati",
        targetState: "Metro Manila",
      },
    ];

    for (const ev of mayEvents) {
      await prisma.event.upsert({
        where: { id: ev.id },
        update: { startAt: ev.startAt, endAt: ev.endAt, eventStatus: ev.eventStatus, requestStatus: ev.requestStatus },
        create: ev,
      });
      console.log(`✓ Seeded May event: ${ev.id}`);
    }

    // ── Bookings for the May events ───────────────────────────────────────────
    const mayBookings = [
      { id: "seed-booking-may-birthday-01", eventId: "seed-event-may-birthday-01", userId: client.id, guestCount: 60,  totalAmount: 35150, startAt: new Date("2026-05-07T18:00:00.000Z"), endAt: new Date("2026-05-08T00:00:00.000Z") },
      { id: "seed-booking-may-birthday-02", eventId: "seed-event-may-birthday-02", userId: host.id,   guestCount: 40,  totalAmount: 35150, startAt: new Date("2026-05-14T17:00:00.000Z"), endAt: new Date("2026-05-14T23:00:00.000Z") },
      { id: "seed-booking-may-wedding-01",  eventId: "seed-event-may-wedding-01",  userId: client.id, guestCount: 150, totalAmount: 85150, startAt: new Date("2026-05-20T10:00:00.000Z"), endAt: new Date("2026-05-20T22:00:00.000Z") },
      { id: "seed-booking-may-corporate-01",eventId: "seed-event-may-corporate-01",userId: host.id,   guestCount: 80,  totalAmount: 60150, startAt: new Date("2026-05-27T08:00:00.000Z"), endAt: new Date("2026-05-27T18:00:00.000Z") },
    ];

    for (const b of mayBookings) {
      await prisma.booking.upsert({
        where: { id: b.id },
        update: { status: BookingStatus.confirmed, startAt: b.startAt, endAt: b.endAt },
        create: { ...b, status: BookingStatus.confirmed, expiresAt: new Date("2026-06-01T00:00:00.000Z") },
      });
      console.log(`✓ Seeded May booking: ${b.id}`);
    }

    // Pre-existing bookings for the approved events
    const bookings = [
      {
        id: "seed-booking-birthday-01",
        eventId: "seed-event-birthday-01",
        userId: client.id,
        guestCount: 50,
        totalAmount: 75000,
        status: BookingStatus.confirmed,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        startAt: new Date(Date.now() + 7  * 86400000),
        endAt:   new Date(Date.now() + 7  * 86400000 + 6 * 3600000),
        payment: {
          id: "seed-payment-birthday-01",
          amount: 37500,    // 50% deposit
          currency: "PHP",
          method: "stripe",
          paymentType: PaymentType.deposit,
          status: PaymentStatus.completed,
          transactionId: "pi_seed_birthday_01",
        },
      },
      {
        id: "seed-booking-corporate-01",
        eventId: "seed-event-corporate-01",
        userId: client.id,
        guestCount: 30,
        totalAmount: 60000,
        status: BookingStatus.confirmed,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        startAt: new Date(Date.now() + 14 * 86400000),
        endAt:   new Date(Date.now() + 14 * 86400000 + 8 * 3600000),
        payment: {
          id: "seed-payment-corporate-01",
          amount: 30000,    // 50% deposit
          currency: "PHP",
          method: "stripe",
          paymentType: PaymentType.deposit,
          status: PaymentStatus.completed,
          transactionId: "pi_seed_corporate_01",
        },
      },
    ];

    for (const b of bookings) {
      const { payment, ...bookingData } = b;

      await prisma.booking.upsert({
        where: { id: b.id },
        update: {
          status: bookingData.status,
          guestCount: bookingData.guestCount,
          totalAmount: bookingData.totalAmount,
        },
        create: {
          id: bookingData.id,
          eventId: bookingData.eventId,
          userId: bookingData.userId,
          guestCount: bookingData.guestCount,
          totalAmount: bookingData.totalAmount,
          status: bookingData.status,
          expiresAt: bookingData.expiresAt,
          startAt: bookingData.startAt,
          endAt: bookingData.endAt,
        },
      });

      // Seed the deposit payment record
      await prisma.payment.upsert({
        where: { id: payment.id },
        update: { status: payment.status },
        create: {
          id: payment.id,
          bookingId: b.id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          paymentType: payment.paymentType,
          status: payment.status,
          transactionId: payment.transactionId,
        },
      });

      console.log(`✓ Seeded booking: ${b.id}`);
    }

    // ── Extra passport bookings — give foxers a rich stamp history ─────────────
    const passportBookings = [
      // Host Reyes — organizer stamps for their past events
      { id: "seed-booking-host-birthday-01",  eventId: "seed-event-birthday-01",      userId: host.id,    guestCount: 50,  totalAmount: 75000, startAt: new Date("2026-06-10T18:00:00.000Z"), endAt: new Date("2026-06-10T23:00:00.000Z") },
      { id: "seed-booking-host-social-01",    eventId: "seed-event-social-01",        userId: host.id,    guestCount: 80,  totalAmount: 40000, startAt: new Date("2026-07-19T16:00:00.000Z"), endAt: new Date("2026-07-19T23:00:00.000Z") },
      { id: "seed-booking-host-wedding-01",   eventId: "seed-event-may-wedding-01",   userId: host.id,    guestCount: 150, totalAmount: 85150, startAt: new Date("2026-05-20T10:00:00.000Z"), endAt: new Date("2026-05-20T22:00:00.000Z") },
      { id: "seed-booking-host-social2-01",   eventId: "seed-event-may-birthday-01",  userId: host.id,    guestCount: 60,  totalAmount: 35150, startAt: new Date("2026-05-07T18:00:00.000Z"), endAt: new Date("2026-05-08T00:00:00.000Z") },
      // Jasmine Reyes
      ...(jasmine ? [
        { id: "seed-booking-jasmine-01", eventId: "seed-event-birthday-01",    userId: jasmine.id, guestCount: 50,  totalAmount: 75000, startAt: new Date("2026-06-10T18:00:00.000Z"), endAt: new Date("2026-06-10T23:00:00.000Z") },
        { id: "seed-booking-jasmine-02", eventId: "seed-event-corporate-01",   userId: jasmine.id, guestCount: 30,  totalAmount: 60000, startAt: new Date("2026-07-30T08:00:00.000Z"), endAt: new Date("2026-07-30T16:00:00.000Z") },
        { id: "seed-booking-jasmine-03", eventId: "seed-event-may-birthday-01",userId: jasmine.id, guestCount: 60,  totalAmount: 35150, startAt: new Date("2026-05-07T18:00:00.000Z"), endAt: new Date("2026-05-08T00:00:00.000Z") },
      ] : []),
      // Marco Santos
      ...(marco ? [
        { id: "seed-booking-marco-01", eventId: "seed-event-social-01",        userId: marco.id,   guestCount: 80,  totalAmount: 40000, startAt: new Date("2026-07-19T16:00:00.000Z"), endAt: new Date("2026-07-19T23:00:00.000Z") },
        { id: "seed-booking-marco-02", eventId: "seed-event-may-corporate-01", userId: marco.id,   guestCount: 80,  totalAmount: 60150, startAt: new Date("2026-05-27T08:00:00.000Z"), endAt: new Date("2026-05-27T18:00:00.000Z") },
      ] : []),
      // Sarah Lim
      ...(sarah ? [
        { id: "seed-booking-sarah-01", eventId: "seed-event-birthday-01",      userId: sarah.id,   guestCount: 50,  totalAmount: 75000, startAt: new Date("2026-06-10T18:00:00.000Z"), endAt: new Date("2026-06-10T23:00:00.000Z") },
        { id: "seed-booking-sarah-02", eventId: "seed-event-may-wedding-01",   userId: sarah.id,   guestCount: 150, totalAmount: 85150, startAt: new Date("2026-05-20T10:00:00.000Z"), endAt: new Date("2026-05-20T22:00:00.000Z") },
      ] : []),
      // Multi Role Villanueva
      ...(multi ? [
        { id: "seed-booking-multi-01", eventId: "seed-event-may-birthday-01",  userId: multi.id,   guestCount: 60,  totalAmount: 35150, startAt: new Date("2026-05-07T18:00:00.000Z"), endAt: new Date("2026-05-08T00:00:00.000Z") },
        { id: "seed-booking-multi-02", eventId: "seed-event-social-01",        userId: multi.id,   guestCount: 80,  totalAmount: 40000, startAt: new Date("2026-07-19T16:00:00.000Z"), endAt: new Date("2026-07-19T23:00:00.000Z") },
      ] : []),
    ];

    for (const b of passportBookings) {
      await prisma.booking.upsert({
        where: { id: b.id },
        update: { status: BookingStatus.confirmed },
        create: { ...b, status: BookingStatus.confirmed, expiresAt: new Date("2026-12-31T00:00:00.000Z") },
      });
    }
    console.log(`✓ Seeded ${passportBookings.length} passport bookings`);

    console.log("✅ Booking seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding bookings:", error);
    throw error;
  }
}

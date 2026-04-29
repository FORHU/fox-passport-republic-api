import { PrismaClient, BookingStatus, PaymentStatus, PaymentType } from "@prisma/client";

export async function seedBookings(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting booking seed...");

    const client = users.find(u => u.email === "user@example.com");
    if (!client) throw new Error("user@example.com not found for booking seeding");

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

    console.log("✅ Booking seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding bookings:", error);
    throw error;
  }
}

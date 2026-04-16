import { PrismaClient, PaymentStatus } from "@prisma/client"

export async function seedPayment(prisma: PrismaClient) {
  const booking = await prisma.booking.findFirst()
  if (!booking) {
    console.warn("No booking found, skipping payment seed")
    return
  }

  const existingPayment = await prisma.payment.findFirst({
    where: { bookingId: booking.id },
  })

  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: booking.totalAmount,
        currency: "PHP",
        method: "GCash",
        status: PaymentStatus.completed,
        transactionId: "TXN-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        paidAt: new Date(),
      },
    })
  }
}


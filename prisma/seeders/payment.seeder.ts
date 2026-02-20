import { PrismaClient } from "@prisma/client"

export async function seedPayment(prisma: PrismaClient) {

  // Get an existing booking
  const booking = await prisma.booking.findFirst()
  if (!booking) {
    throw new Error("❌ No booking found. Please seed bookings first.")
  }

  // Check if a payment already exists for this booking
  const existingPayment = await prisma.payment.findFirst({
    where: { bookingId: booking.id },
  })

  if (existingPayment) {
    // Update only transactionId and gatewayResponse
    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: {
        transactionId: "PAY-001",
        gatewayResponse: "GCASH_SUCCESS",
      },
    })
  } 
}


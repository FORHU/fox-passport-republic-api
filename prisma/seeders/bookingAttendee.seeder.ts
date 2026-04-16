import { PrismaClient } from "@prisma/client"

export async function seedBookingAttendee(prisma: PrismaClient) {
  const booking = await prisma.booking.findFirst()

  if (!booking) return

  const attendees = [
    {
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan@email.com",
      phone: "09123456789",
      ticketCode: "TICKET-001",
      checkedIn: true,
    },
    {
      firstName: "Maria",
      lastName: "Santos",
      email: "maria@email.com",
      phone: "09876543210",
      ticketCode: "TICKET-002",
      checkedIn: false,
    },
  ]

  for (const attendee of attendees) {
    await prisma.bookingAttendee.upsert({
      where: { ticketCode: attendee.ticketCode },
      update: {},
      create: {
        bookingId: booking.id,
        ...attendee,
      },
    })
  }
}

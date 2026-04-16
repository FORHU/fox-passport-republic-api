import { BillingRate, PrismaClient, TransactionStatus } from "@prisma/client"

export async function seedEventService(prisma: PrismaClient) {
  const event = await prisma.event.findFirst({
    where: { name: "Tech Networking Night" },
  })

  const services = await prisma.service.findMany({
    take: 2,
  })

  if (!event || services.length === 0) return

  for (const service of services) {
    await prisma.eventService.upsert({
      where: {
        eventId_serviceId: {
          eventId: event.id,
          serviceId: service.id,
        },
      },
      update: {},
      create: {
        eventId: event.id,
        serviceId: service.id,
        agreedPrice: service.price,
        billingRate: service.billingRate,
        status: TransactionStatus.approved,
      },
    })
  }
}

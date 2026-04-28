import { PrismaClient, EventCategory, RequestStatus, EventStatus } from "@prisma/client";

export async function seedEvents(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting event seed...");

    const client = users.find(u => u.email === "user@example.com");
    const host = users.find(u => u.email === "host@example.com");
    if (!client) throw new Error("user@example.com not found for event seeding");
    if (!host) throw new Error("host@example.com not found for event seeding");

    // 1. Seed EventTemplates
    const templates = [
      {
        id: "seed-template-birthday",
        ownerId: host.id,
        name: "Birthday Bash Package",
        description: "Everything you need for an unforgettable birthday party.",
        category: EventCategory.birthday,
        isPublic: true,
        targetCity: "Manila",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      {
        id: "seed-template-corporate",
        ownerId: host.id,
        name: "Corporate Event Package",
        description: "Professional setup for corporate meetings and conferences.",
        category: EventCategory.corporate,
        isPublic: true,
        targetCity: "Taguig",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      {
        id: "seed-template-social",
        ownerId: host.id,
        name: "Social Gathering Package",
        description: "A relaxed and fun setup for social hangouts.",
        category: EventCategory.social,
        isPublic: true,
        targetCountry: "Philippines",
      },
    ];

    for (const t of templates) {
      await prisma.eventTemplate.upsert({
        where: { id: t.id },
        update: { name: t.name, description: t.description },
        create: t,
      });
    }

    console.log("✓ EventTemplates seeded");

    // 2. Seed Events (approved and ready to book)
    const now = new Date();
    const events = [
      {
        id: "seed-event-birthday-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-birthday",
        name: "Maria's 30th Birthday Celebration",
        description: "A grand birthday party for 50 guests at Grand Palace Hall.",
        eventCategory: EventCategory.birthday,
        startAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),  // 7 days from now
        endAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000), // +6 hours
        guestCount: 50,
        totalAmount: 25000,
        requestStatus: RequestStatus.approved,
        eventStatus: EventStatus.pending,
        targetCity: "Manila",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      {
        id: "seed-event-corporate-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-corporate",
        name: "Q3 Team Strategy Summit",
        description: "Quarterly strategy meeting for 30 team members.",
        eventCategory: EventCategory.corporate,
        startAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        endAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000), // +8 hours
        guestCount: 30,
        totalAmount: 40000,
        requestStatus: RequestStatus.approved,
        eventStatus: EventStatus.pending,
        targetCity: "Taguig",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      {
        id: "seed-event-social-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-social",
        name: "Summer Rooftop Social",
        description: "A chill rooftop social for friends and colleagues.",
        eventCategory: EventCategory.social,
        startAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
        guestCount: 80,
        totalAmount: 60000,
        requestStatus: RequestStatus.approved,
        eventStatus: EventStatus.pending,
        targetCity: "Taguig",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      // ── Pending (awaiting admin approval) ──────────────────────────────────
      {
        id: "seed-event-wedding-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-birthday",
        name: "Garcia-Reyes Wedding Reception",
        description: "Elegant wedding reception for 120 guests at a beachfront venue.",
        eventCategory: EventCategory.wedding,
        startAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        guestCount: 120,
        totalAmount: 150000,
        requestStatus: RequestStatus.pending,
        eventStatus: EventStatus.pending,
        targetCity: "Boracay",
        targetState: "Aklan",
        targetCountry: "Philippines",
      },
      {
        id: "seed-event-corporate-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-corporate",
        name: "Tech Startup Demo Day 2026",
        description: "Annual startup pitch and product demo event for investors and press.",
        eventCategory: EventCategory.corporate,
        startAt: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000),
        guestCount: 200,
        totalAmount: 80000,
        requestStatus: RequestStatus.pending,
        eventStatus: EventStatus.pending,
        targetCity: "Taguig",
        targetState: "Metro Manila",
        targetCountry: "Philippines",
      },
      {
        id: "seed-event-social-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: "seed-template-social",
        name: "Cebu Food & Music Festival",
        description: "A weekend social festival featuring local food vendors and live music.",
        eventCategory: EventCategory.social,
        startAt: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
        guestCount: 500,
        totalAmount: 200000,
        requestStatus: RequestStatus.pending,
        eventStatus: EventStatus.pending,
        targetCity: "Cebu City",
        targetState: "Cebu",
        targetCountry: "Philippines",
      },
    ];

    for (const e of events) {
      await prisma.event.upsert({
        where: { id: e.id },
        update: {
          name: e.name,
          description: e.description,
          startAt: e.startAt,
          endAt: e.endAt,
          guestCount: e.guestCount,
          totalAmount: e.totalAmount,
          requestStatus: e.requestStatus,
        },
        create: e,
      });
      console.log(`✓ Seeded event: ${e.name}`);
    }

    console.log("✅ Event seeding completed successfully!");
    return events;
  } catch (error) {
    console.error("❌ Error seeding events:", error);
    throw error;
  }
}

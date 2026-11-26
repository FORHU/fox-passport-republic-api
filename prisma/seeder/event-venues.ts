import {
  MatchRequestStatus,
  Prisma,
  PrismaClient,
  TransactionStatus,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Every seeded package, event and stamp has a venue (api#480). Only seeded
 * records: a venue is chosen here for each, by hand, and one that already has
 * a venue of its own is left alone.
 */
export const PACKAGE_VENUES: Record<string, string> = {
  "seed-template-bulk-art-exhibit": "seed-venue-summit-corporate-center",
  "seed-template-bulk-beach-wedding": "seed-venue-boracay-beach-resort",
  "seed-template-bulk-birthday-baguio-2":
    "seed-venue-pinecrest-mountain-estate",
  "seed-template-bulk-birthday-baguio-3":
    "seed-venue-pinecrest-mountain-estate",
  "seed-template-bulk-birthday-cebu-2": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-birthday-cebu-3": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-birthday-cebu-4": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-birthday-clark-2": "seed-venue-the-grand-plaza-ballroom",
  "seed-template-bulk-birthday-clark-3": "seed-venue-the-grand-plaza-ballroom",
  "seed-template-bulk-birthday-davao-2": "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-birthday-makati-2": "seed-venue-the-neon-glass-hangar",
  "seed-template-bulk-birthday-manila-2": "seed-venue-reyes-manila-hall",
  "seed-template-bulk-birthday-manila-3": "seed-venue-grand-palace-hall",
  "seed-template-bulk-cebu-fiesta": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-corp-summit": "seed-venue-the-loft-bgc",
  "seed-template-bulk-corporate-baguio-2":
    "seed-venue-pinecrest-mountain-estate",
  "seed-template-bulk-corporate-baguio-3":
    "seed-venue-pinecrest-mountain-estate",
  "seed-template-bulk-corporate-cebu-2":
    "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-corporate-clark-2": "seed-venue-the-grand-plaza-ballroom",
  "seed-template-bulk-corporate-davao-2":
    "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-corporate-davao-3":
    "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-corporate-davao-4":
    "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-corporate-makati-2": "seed-venue-the-neon-glass-hangar",
  "seed-template-bulk-corporate-makati-3": "seed-venue-the-neon-glass-hangar",
  "seed-template-bulk-corporate-makati-4": "seed-venue-the-neon-glass-hangar",
  "seed-template-bulk-corporate-manila-2": "seed-venue-reyes-manila-hall",
  "seed-template-bulk-davao-corp": "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-debut-party": "seed-venue-the-emerald-conservatory",
  "seed-template-bulk-garden-birthday": "seed-venue-casa-veranda-tagaytay",
  "seed-template-bulk-holiday-gala": "seed-venue-the-neon-glass-hangar",
  "seed-template-bulk-intimate-wedding": "seed-venue-canyon-view-lakeside-deck",
  "seed-template-bulk-kiddie-party": "seed-venue-reyes-manila-hall",
  "seed-template-bulk-music-festival": "seed-venue-sugbo-open-grounds",
  "seed-template-bulk-other-baguio-2": "seed-venue-the-ridge-amphitheater",
  "seed-template-bulk-other-baguio-3": "seed-venue-the-ridge-amphitheater",
  "seed-template-bulk-other-cebu-2": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-other-cebu-3": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-other-clark-2": "seed-venue-vista-green-golf-meadows",
  "seed-template-bulk-other-clark-3": "seed-venue-monet's-meadow-park",
  "seed-template-bulk-other-davao-2": "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-other-makati-2": "seed-venue-industrial-hangar-studio",
  "seed-template-bulk-other-manila-2": "seed-venue-metropolitan-theater-studio",
  "seed-template-bulk-other-manila-3": "seed-venue-metropolitan-theater-studio",
  "seed-template-bulk-outdoor-concert": "seed-venue-vista-green-golf-meadows",
  "seed-template-bulk-pool-party": "seed-venue-malate-poolside-club",
  "seed-template-bulk-product-launch": "seed-venue-the-loft-bgc",
  "seed-template-bulk-reunion-package": "seed-venue-laguna-lakeside-resort",
  "seed-template-bulk-rooftop-social": "seed-venue-legazpi-rooftop-terrace",
  "seed-template-bulk-social-baguio-2": "seed-venue-the-ridge-amphitheater",
  "seed-template-bulk-social-cebu-2": "seed-venue-sugbo-shoreline-cove",
  "seed-template-bulk-social-cebu-3": "seed-venue-skyline-function-hall-cebu",
  "seed-template-bulk-social-clark-2": "seed-venue-vista-green-golf-meadows",
  "seed-template-bulk-social-clark-3": "seed-venue-vista-green-golf-meadows",
  "seed-template-bulk-social-davao-2": "seed-venue-centennial-crown-pavilion",
  "seed-template-bulk-social-davao-3": "seed-venue-vista-deck-infinity-pool",
  "seed-template-bulk-social-makati-2": "seed-venue-legazpi-rooftop-terrace",
  "seed-template-bulk-social-makati-3": "seed-venue-legazpi-rooftop-terrace",
  "seed-template-bulk-social-manila-2":
    "seed-venue-metropolitan-theater-studio",
  "seed-template-bulk-social-manila-3": "seed-venue-reyes-manila-hall",
  "seed-template-bulk-social-manila-4": "seed-venue-malate-poolside-club",
  "seed-template-bulk-sunset-dinner": "seed-venue-san-juan-surfside-deck",
  "seed-template-bulk-wedding-baguio-2": "seed-venue-pinecrest-mountain-estate",
  "seed-template-bulk-wedding-baguio-3":
    "seed-venue-mountaintop-observatory-deck",
  "seed-template-bulk-wedding-cebu-2": "seed-venue-busay-hillside-gardens",
  "seed-template-bulk-wedding-cebu-3": "seed-venue-sugbo-shoreline-cove",
  "seed-template-bulk-wedding-cebu-4": "seed-venue-sugbo-shoreline-cove",
  "seed-template-bulk-wedding-clark-2": "seed-venue-monet's-meadow-park",
  "seed-template-bulk-wedding-davao-2": "seed-venue-pearl-farm-beach-cove",
  "seed-template-bulk-wedding-davao-3": "seed-venue-davao-heritage-barn",
  "seed-template-bulk-wedding-makati-2": "seed-venue-salcedo-garden-courtyard",
  "seed-template-bulk-wedding-manila-2": "seed-venue-the-heritage-atrium",
  "seed-template-bulk-wedding-manila-3": "seed-venue-garden-gazebo",
  "seed-template-hero-intimate-wedding": "seed-venue-casa-veranda-tagaytay",
  "seed-template-hero-kids-bday": "seed-venue-orchid-heritage-gardens",
  "seed-template-hero-launch": "seed-venue-the-neon-glass-hangar",
  "seed-template-hero-rooftop": "seed-venue-the-loft-bgc",
  "seed-template-multi-corporate": "seed-venue-summit-corporate-center",
  "seed-template-multi-social": "seed-venue-aura-rooftop-lounge",
};

/**
 * Where each seeded event is held: in the event's own city, which is not
 * always its package's. `agreedPrice` is the venue's share of the event.
 */
export const EVENT_VENUES: Record<
  string,
  { venueId: string; agreedPrice: number; status?: TransactionStatus }
> = {
  "seed-event-birthday-01": {
    venueId: "seed-venue-grand-palace-hall",
    agreedPrice: 50000,
  },
  "seed-event-corporate-01": {
    venueId: "seed-venue-the-loft-bgc",
    agreedPrice: 20000,
  },
  "seed-event-social-01": {
    venueId: "seed-venue-the-loft-bgc",
    agreedPrice: 20000,
  },
  "seed-event-wedding-pending": {
    venueId: "seed-venue-boracay-beach-resort",
    agreedPrice: 75000,
    status: TransactionStatus.pending,
  },
  "seed-event-corporate-pending": {
    venueId: "seed-venue-the-loft-bgc",
    agreedPrice: 20000,
    status: TransactionStatus.pending,
  },
  "seed-event-social-pending": {
    venueId: "seed-venue-sugbo-open-grounds",
    agreedPrice: 60000,
    status: TransactionStatus.pending,
  },
  "seed-event-may-birthday-01": {
    venueId: "seed-venue-orchid-heritage-gardens",
    agreedPrice: 32000,
  },
  "seed-event-may-birthday-02": {
    venueId: "seed-venue-reyes-rooftop-pasig",
    agreedPrice: 22000,
  },
  "seed-event-may-wedding-01": {
    venueId: "seed-venue-casa-veranda-tagaytay",
    agreedPrice: 35000,
  },
  "seed-event-may-corporate-01": {
    venueId: "seed-venue-industrial-hangar-studio",
    agreedPrice: 35000,
  },
};

/** The bulk test events use the bulk test venue of their city. */
export const BULK_EVENT_VENUES: Record<string, string> = {
  Manila: "seed-venue-bulk-test-venue-32---manila",
  Taguig: "seed-venue-bulk-test-venue-33---taguig",
};

/**
 * Package lines that named a venue in another city (api#500), by line id:
 * the venue it was, and the one in the package's own city.
 */
export const PACKAGE_VENUE_MOVES: Record<string, { from: string; to: string }> =
  {
    "seed-tv-corporate-loft": {
      from: "seed-venue-the-loft-bgc",
      to: "seed-venue-summit-corporate-center",
    },
    "seed-tv-social-gazebo": {
      from: "seed-venue-garden-gazebo",
      to: "seed-venue-busay-hillside-gardens",
    },
    "seed-tv-other-loft": {
      from: "seed-venue-the-loft-bgc",
      to: "seed-venue-reyes-manila-hall",
    },
    "seed-tv-gala-palace": {
      from: "seed-venue-grand-palace-hall",
      to: "seed-venue-the-neon-glass-hangar",
    },
    "seed-tv-fundraiser-gazebo": {
      from: "seed-venue-garden-gazebo",
      to: "seed-venue-orchid-heritage-gardens",
    },
    "seed-tv-reunion-gazebo": {
      from: "seed-venue-garden-gazebo",
      to: "seed-venue-skyline-function-hall-cebu",
    },
    "seed-tv-retreat-gazebo": {
      from: "seed-venue-garden-gazebo",
      to: "seed-venue-pinecrest-mountain-estate",
    },
  };

/** Gives a seeded package its venue, unless it has one already. */
export async function seedPackageVenue(
  prisma: Db,
  templateId: string,
  venueId: string,
) {
  const id = `seed-tv-${templateId.replace("seed-template-", "")}`;
  const other = await prisma.eventTemplateVenue.findFirst({
    where: { templateId, venueId: { not: null }, id: { not: id } },
    select: { id: true },
  });
  if (other) return;
  const data = {
    venueId,
    matched: true,
    matchRequestStatus: MatchRequestStatus.accepted,
  };
  await prisma.eventTemplateVenue.upsert({
    where: { id },
    update: data,
    create: { id, templateId, matchedAt: new Date(), ...data },
  });
}

/**
 * Gives a seeded event its venue, unless it has a live one already. No
 * booking is linked: these lines say where the event is held, and the payout
 * sweep pays the ones a booking carries.
 */
export async function seedEventVenue(
  prisma: Db,
  eventId: string,
  line: { venueId: string; agreedPrice: number; status?: TransactionStatus },
) {
  const id = `seed-evt-venue-${eventId}`;
  const other = await prisma.eventVenueTransaction.findFirst({
    where: {
      eventId,
      id: { not: id },
      status: {
        notIn: [TransactionStatus.rejected, TransactionStatus.cancelled],
      },
    },
    select: { id: true },
  });
  if (other) return;
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: line.venueId },
    select: { mayorId: true },
  });
  const data = {
    venueId: line.venueId,
    providerId: venue.mayorId,
    agreedPrice: line.agreedPrice,
    status: line.status ?? TransactionStatus.approved,
  };
  await prisma.eventVenueTransaction.upsert({
    where: { id },
    update: data,
    create: { id, eventId, ...data },
  });
}

/** Fails the seed if a seeded record was left without a venue. */
export async function assertSeedVenues(prisma: PrismaClient) {
  const seeded = { startsWith: "seed-" };
  const [packages, events, stamps] = await Promise.all([
    prisma.eventTemplate.findMany({
      where: {
        id: seeded,
        status: "published",
        templateVenues: { none: { venueId: { not: null } } },
      },
      select: { id: true },
    }),
    prisma.event.findMany({
      where: {
        id: { startsWith: "seed-event-" },
        venueTransactions: { none: {} },
      },
      select: { id: true },
    }),
    // Raw: before api#482's migration a stamp could have no venue, which the
    // client's types no longer allow.
    prisma.$queryRaw<{ bookingId: string }[]>`
      SELECT "bookingId" FROM passport_stamps
      WHERE "bookingId" LIKE 'seed-%' AND "venueId" IS NULL`,
  ]);
  const missing = [
    ...packages.map((p) => p.id),
    ...events.map((e) => e.id),
    ...stamps.map((s) => `stamp of ${s.bookingId}`),
  ];
  if (missing.length > 0) {
    throw new Error(`Seeded without a venue: ${missing.join(", ")}`);
  }
  console.log("✓ Every seeded package, event and stamp has a venue");
}

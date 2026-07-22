import { PrismaClient, EventCategory, RequestStatus, EventStatus, MatchRequestStatus } from "@prisma/client";

// ── Deterministic IDs ────────────────────────────────────────────────────────
const TEMPLATE_IDS = {
  birthday:  "seed-template-birthday",
  wedding:   "seed-template-wedding",
  corporate: "seed-template-corporate",
  social:    "seed-template-social",
  other:     "seed-template-other",
};

const ASSET_IDS = {
  speakers:  "seed-asset-stage-speakers-xl",
  lights:    "seed-asset-led-flood-lights-rgb",
  floral:    "seed-asset-floral-arch-setup",
  chairs:    "seed-asset-tiffany-chairs-(set-of-50)",
};

const SERVICE_IDS = {
  photo:     "seed-service-manila-event-photography",
  catering:  "seed-service-metro-manila-premium-catering",
  band:      "seed-service-live-band-performance",
  waitstaff: "seed-service-event-waitstaff-team",
};

const VENUE_IDS = {
  palace:  "seed-venue-grand-palace-hall",
  gazebo:  "seed-venue-garden-gazebo",
  boracay: "seed-venue-boracay-beach-resort",
  loft:    "seed-venue-the-loft-bgc",
};

export async function seedEvents(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting event seed...");

    const client = users.find(u => u.email === "user@example.com");
    const host   = users.find(u => u.email === "host@example.com");
    const multi  = users.find(u => u.email === "multirole@example.com");
    if (!client) throw new Error("user@example.com not found for event seeding");
    if (!host)   throw new Error("host@example.com not found for event seeding");

    // ── 1. EventTemplates ────────────────────────────────────────────────────
    const templateDefs = [
      {
        id: TEMPLATE_IDS.birthday,
        name: "Birthday Bash Package",
        description: "Everything you need for an unforgettable birthday party — from a grand venue and floral setup to live catering and full waitstaff. Let us handle the details while you celebrate.",
        category: EventCategory.birthday,
        targetCity: "Manila", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.wedding,
        name: "Wedding Celebration Package",
        description: "An elegant beachfront wedding experience crafted to perfection. Includes a stunning arch, premium catering, Tiffany seating, and professional photography on the shores of Boracay.",
        category: EventCategory.wedding,
        targetCity: "Boracay", targetState: "Aklan", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.corporate,
        name: "Corporate Event Package",
        description: "Professional setup for corporate meetings, product launches, and conferences. Full AV, photography coverage, and a premium BGC loft venue included.",
        category: EventCategory.corporate,
        targetCity: "Taguig", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.social,
        name: "Social Gathering Package",
        description: "A relaxed yet vibrant setup for social hangouts, reunions, and celebrations. Featuring live band entertainment, quality sound, and a beautiful outdoor garden venue.",
        category: EventCategory.social,
        targetCity: "Cebu City", targetState: "Cebu", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.other,
        name: "Custom Event Package",
        description: "A fully flexible package for any kind of event. Comes with professional photography and a choice of venue. Add your own flair and build from here.",
        category: EventCategory.other,
        targetCity: "Manila", targetState: "Metro Manila", targetCountry: "Philippines",
      },
    ];

    for (const t of templateDefs) {
      await prisma.eventTemplate.upsert({
        where: { id: t.id },
        update: { name: t.name, description: t.description, isPublic: true, status: "published" },
        create: { ...t, ownerId: host.id, isPublic: true, status: "published" },
      });
    }

    // Multi-role user also gets two event templates so their profile isn't empty
    if (multi) {
      const multiTemplates = [
        {
          id: "seed-template-multi-social",
          name: "All-In-One Social Night",
          description: "A full-production social event package — venue, sound, lighting, catering, and entertainment all coordinated by one foxer. Perfect for parties, reunions, and themed nights.",
          category: EventCategory.social,
          targetCity: "Pasig", targetState: "Metro Manila", targetCountry: "Philippines",
        },
        {
          id: "seed-template-multi-corporate",
          name: "Turnkey Corporate Function",
          description: "End-to-end corporate event management. From venue scouting to AV setup, catering, and on-the-day coordination — one point of contact for everything.",
          category: EventCategory.corporate,
          targetCity: "Pasig", targetState: "Metro Manila", targetCountry: "Philippines",
        },
      ];
      for (const t of multiTemplates) {
        await prisma.eventTemplate.upsert({
          where: { id: t.id },
          update: { name: t.name, description: t.description, isPublic: true, status: "published" },
          create: { ...t, ownerId: multi.id, isPublic: true, status: "published" },
        });
      }
    }

    // ── Bulk event templates for pagination testing ──────────────────────────
    const BULK_TEMPLATE_DEFS: { suffix: string; name: string; desc: string; category: EventCategory; city: string; state: string }[] = [
      { suffix: "beach-wedding", name: "Beach Wedding Bliss", desc: "A stunning beachfront wedding experience with full coordination and decor.", category: EventCategory.wedding, city: "Boracay", state: "Aklan" },
      { suffix: "garden-birthday", name: "Garden Birthday Fiesta", desc: "Outdoor birthday party in a lush garden venue with catering and entertainment.", category: EventCategory.birthday, city: "Tagaytay", state: "Cavite" },
      { suffix: "rooftop-social", name: "Rooftop Social Night", desc: "An elevated social gathering on a city rooftop with live music and cocktails.", category: EventCategory.social, city: "Makati", state: "Metro Manila" },
      { suffix: "corp-summit", name: "Leadership Summit Package", desc: "Professional conference setup with AV, staging, and catering for 100+ attendees.", category: EventCategory.corporate, city: "Taguig", state: "Metro Manila" },
      { suffix: "debut-party", name: "Grand Debut Celebration", desc: "A fairytale 18th birthday debut with full production, sound, and styling.", category: EventCategory.birthday, city: "Quezon City", state: "Metro Manila" },
      { suffix: "cebu-fiesta", name: "Cebu Island Fiesta", desc: "Traditional Filipino fiesta celebration with local cuisine, music, and dance.", category: EventCategory.social, city: "Cebu City", state: "Cebu" },
      { suffix: "davao-corp", name: "Davao Business Convention", desc: "Full-scale business convention with exhibit booths, keynote staging, and networking.", category: EventCategory.corporate, city: "Davao City", state: "Davao del Sur" },
      { suffix: "intimate-wedding", name: "Intimate Wedding Package", desc: "A cozy wedding celebration for 30 guests with curated decor and live acoustics.", category: EventCategory.wedding, city: "Antipolo", state: "Rizal" },
      { suffix: "pool-party", name: "Pool Party Package", desc: "Fun-filled pool party with DJ, inflatables, and poolside bar service.", category: EventCategory.social, city: "Manila", state: "Metro Manila" },
      { suffix: "art-exhibit", name: "Art & Culture Exhibit", desc: "Gallery-style event with lighting, curation, and cocktail reception.", category: EventCategory.other, city: "Pasig", state: "Metro Manila" },
      { suffix: "holiday-gala", name: "Holiday Gala Night", desc: "Year-end gala dinner with formal setup, live band, and awards ceremony.", category: EventCategory.corporate, city: "Makati", state: "Metro Manila" },
      { suffix: "outdoor-concert", name: "Outdoor Concert Package", desc: "Open-air concert setup with stage, sound system, lighting, and crowd management.", category: EventCategory.other, city: "Clark", state: "Pampanga" },
      { suffix: "kiddie-party", name: "Kiddie Party Bundle", desc: "Colorful kids' party with games, face painting, balloon twisting, and buffet.", category: EventCategory.birthday, city: "Manila", state: "Metro Manila" },
      { suffix: "reunion-package", name: "Family Reunion Package", desc: "Large family gathering with activities, catering, and photo coverage.", category: EventCategory.social, city: "Laguna", state: "Laguna" },
      { suffix: "product-launch", name: "Product Launch Event", desc: "Sleek product unveiling with media setup, stage design, and press kits.", category: EventCategory.corporate, city: "Taguig", state: "Metro Manila" },
      { suffix: "sunset-dinner", name: "Sunset Dinner Experience", desc: "Seaside dinner event with live acoustic music and curated Filipino cuisine.", category: EventCategory.other, city: "La Union", state: "La Union" },
      { suffix: "music-festival", name: "Mini Music Festival", desc: "Multi-stage music event with food stalls, art installations, and VIP areas.", category: EventCategory.other, city: "Cebu City", state: "Cebu" },
    ];

    // Assign ownership across bulk event foxers (round-robin)
    const bulkEventFoxers = users.filter((u: any) => (u.email as string).startsWith("ef-"));
    for (let i = 0; i < BULK_TEMPLATE_DEFS.length; i++) {
      const t = BULK_TEMPLATE_DEFS[i];
      const owner = bulkEventFoxers.length > 0
        ? bulkEventFoxers[i % bulkEventFoxers.length]
        : host;
      const templateId = `seed-template-bulk-${t.suffix}`;
      await prisma.eventTemplate.upsert({
        where: { id: templateId },
        update: { name: t.name, description: t.desc, isPublic: true, status: "published" },
        create: {
          id: templateId,
          name: t.name,
          description: t.desc,
          category: t.category,
          targetCity: t.city,
          targetState: t.state,
          targetCountry: "Philippines",
          ownerId: owner.id,
          isPublic: true,
          status: "published",
        },
      });
    }
    console.log(`✓ Seeded ${BULK_TEMPLATE_DEFS.length} bulk event templates`);

    console.log("✓ EventTemplates seeded");

    // ── 2. File (images) for each template ──────────────────────────────────
    const templateImages: Record<string, { id: string; url: string; name: string }[]> = {
      [TEMPLATE_IDS.birthday]: [
        { id: "seed-file-birthday-1", url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop", name: "Birthday Party Hall" },
        { id: "seed-file-birthday-2", url: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&auto=format&fit=crop", name: "Birthday Cake" },
        { id: "seed-file-birthday-3", url: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=800&auto=format&fit=crop", name: "Birthday Celebration" },
      ],
      [TEMPLATE_IDS.wedding]: [
        { id: "seed-file-wedding-1", url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop", name: "Wedding Ceremony" },
        { id: "seed-file-wedding-2", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&auto=format&fit=crop", name: "Wedding Reception" },
        { id: "seed-file-wedding-3", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800&auto=format&fit=crop", name: "Beachfront Wedding" },
      ],
      [TEMPLATE_IDS.corporate]: [
        { id: "seed-file-corporate-1", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop", name: "Corporate Event Stage" },
        { id: "seed-file-corporate-2", url: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop", name: "Conference Room" },
        { id: "seed-file-corporate-3", url: "https://images.unsplash.com/photo-1559223607-b4d0555ae227?w=800&auto=format&fit=crop", name: "Team Summit" },
      ],
      [TEMPLATE_IDS.social]: [
        { id: "seed-file-social-1", url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop", name: "Social Party" },
        { id: "seed-file-social-2", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop", name: "Live Music Gathering" },
        { id: "seed-file-social-3", url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop", name: "Outdoor Social" },
      ],
      [TEMPLATE_IDS.other]: [
        { id: "seed-file-other-1", url: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop", name: "Custom Event" },
        { id: "seed-file-other-2", url: "https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?w=800&auto=format&fit=crop", name: "Event Setup" },
        { id: "seed-file-other-3", url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&auto=format&fit=crop", name: "Flexible Venue Layout" },
      ],
      "seed-template-multi-social": [
        { id: "seed-file-multi-social-1", url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop", name: "Social Night Crowd" },
        { id: "seed-file-multi-social-2", url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop", name: "DJ Night" },
        { id: "seed-file-multi-social-3", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop", name: "Live Entertainment" },
      ],
      "seed-template-multi-corporate": [
        { id: "seed-file-multi-corp-1", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop", name: "Corporate Stage" },
        { id: "seed-file-multi-corp-2", url: "https://images.unsplash.com/photo-1559223607-b4d0555ae227?w=800&auto=format&fit=crop", name: "Team Summit" },
        { id: "seed-file-multi-corp-3", url: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop", name: "Conference Setup" },
      ],
    };

    // ── Bulk template images ────────────────────────────────────────────────
    // Record<EventCategory, string> ensures every category has a cover image;
    // TypeScript will error at compile time if a new EventCategory is added
    // without a corresponding entry here.
    const TEMPLATE_COVER_URLS: Record<EventCategory, string> = {
      [EventCategory.wedding]:   "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop",
      [EventCategory.birthday]:  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
      [EventCategory.corporate]: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
      [EventCategory.social]:    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop",
      [EventCategory.other]:     "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop",
    };

    for (const t of BULK_TEMPLATE_DEFS) {
      const templateId = `seed-template-bulk-${t.suffix}`;
      const coverUrl = TEMPLATE_COVER_URLS[t.category];
      templateImages[templateId] = [
        { id: `seed-file-bulk-${t.suffix}-1`, url: coverUrl, name: `${t.name} Cover` },
      ];
    }

    for (const [templateId, files] of Object.entries(templateImages)) {
      for (const f of files) {
        await prisma.file.upsert({
          where: { id: f.id },
          update: { url: f.url, name: f.name, templateId },
          create: { id: f.id, url: f.url, name: f.name, type: "image/jpeg", templateId },
        });
      }
    }
    console.log("✓ Template images seeded");

    // ── 3. Attach assets / services / venues to templates ───────────────────
    type TemplateAttachment = {
      templateId: string;
      assets: { id: string; assetId: string; quantity: number; matched?: boolean; matchRequestStatus?: MatchRequestStatus; matchedAt?: Date }[];
      services: { id: string; serviceId: string; matched?: boolean; matchRequestStatus?: MatchRequestStatus; matchedAt?: Date }[];
      venues: { id: string; venueId: string; matched?: boolean; matchRequestStatus?: MatchRequestStatus; matchedAt?: Date }[];
    };

    const matchedAt = new Date();

    const attachments: TemplateAttachment[] = [
      {
        templateId: TEMPLATE_IDS.birthday,
        assets:   [
          { id: "seed-ta-birthday-floral",   assetId: ASSET_IDS.floral,   quantity: 1, matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt },
          { id: "seed-ta-birthday-speakers", assetId: ASSET_IDS.speakers, quantity: 2, matched: true, matchRequestStatus: MatchRequestStatus.pending,  matchedAt },
        ],
        services: [
          { id: "seed-ts-birthday-catering",  serviceId: SERVICE_IDS.catering,  matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt },
          { id: "seed-ts-birthday-waitstaff", serviceId: SERVICE_IDS.waitstaff, matched: true, matchRequestStatus: MatchRequestStatus.pending,  matchedAt },
        ],
        venues: [{ id: "seed-tv-birthday-palace", venueId: VENUE_IDS.palace, matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt }],
      },
      {
        templateId: TEMPLATE_IDS.wedding,
        assets:   [
          { id: "seed-ta-wedding-floral",   assetId: ASSET_IDS.floral,  quantity: 2, matched: true, matchRequestStatus: MatchRequestStatus.secured,  matchedAt },
          { id: "seed-ta-wedding-chairs",   assetId: ASSET_IDS.chairs,  quantity: 1, matched: true, matchRequestStatus: MatchRequestStatus.secured,  matchedAt },
          { id: "seed-ta-wedding-lights",   assetId: ASSET_IDS.lights,  quantity: 6, matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt },
        ],
        services: [
          { id: "seed-ts-wedding-catering",  serviceId: SERVICE_IDS.catering,  matched: true, matchRequestStatus: MatchRequestStatus.secured,  matchedAt },
          { id: "seed-ts-wedding-photo",     serviceId: SERVICE_IDS.photo,     matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt },
          { id: "seed-ts-wedding-waitstaff", serviceId: SERVICE_IDS.waitstaff, matched: true, matchRequestStatus: MatchRequestStatus.declined, matchedAt },
        ],
        venues: [{ id: "seed-tv-wedding-boracay", venueId: VENUE_IDS.boracay, matched: true, matchRequestStatus: MatchRequestStatus.secured, matchedAt }],
      },
      {
        templateId: TEMPLATE_IDS.corporate,
        assets:   [
          { id: "seed-ta-corporate-speakers", assetId: ASSET_IDS.speakers, quantity: 2, matched: true, matchRequestStatus: MatchRequestStatus.pending, matchedAt },
          { id: "seed-ta-corporate-lights",   assetId: ASSET_IDS.lights,   quantity: 4 },
        ],
        services: [
          { id: "seed-ts-corporate-photo",     serviceId: SERVICE_IDS.photo,     matched: true, matchRequestStatus: MatchRequestStatus.accepted, matchedAt },
          { id: "seed-ts-corporate-catering",  serviceId: SERVICE_IDS.catering },
          { id: "seed-ts-corporate-waitstaff", serviceId: SERVICE_IDS.waitstaff },
        ],
        venues: [{ id: "seed-tv-corporate-loft", venueId: VENUE_IDS.loft }],
      },
      {
        templateId: TEMPLATE_IDS.social,
        assets:   [
          { id: "seed-ta-social-speakers", assetId: ASSET_IDS.speakers, quantity: 2 },
          { id: "seed-ta-social-lights",   assetId: ASSET_IDS.lights,   quantity: 4 },
        ],
        services: [
          { id: "seed-ts-social-band",      serviceId: SERVICE_IDS.band },
          { id: "seed-ts-social-catering",  serviceId: SERVICE_IDS.catering },
          { id: "seed-ts-social-waitstaff", serviceId: SERVICE_IDS.waitstaff },
        ],
        venues: [{ id: "seed-tv-social-gazebo", venueId: VENUE_IDS.gazebo }],
      },
      {
        templateId: TEMPLATE_IDS.other,
        assets:   [{ id: "seed-ta-other-speakers", assetId: ASSET_IDS.speakers, quantity: 1 }],
        services: [{ id: "seed-ts-other-photo", serviceId: SERVICE_IDS.photo }],
        venues:   [{ id: "seed-tv-other-loft", venueId: VENUE_IDS.loft }],
      },
    ];

    for (const att of attachments) {
      for (const a of att.assets) {
        await prisma.eventTemplateAsset.upsert({
          where: { id: a.id },
          update: { quantity: a.quantity, matched: a.matched ?? false, matchRequestStatus: a.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: a.matchedAt },
          create: { id: a.id, templateId: att.templateId, assetId: a.assetId, quantity: a.quantity, matched: a.matched ?? false, matchRequestStatus: a.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: a.matchedAt },
        });
      }
      for (const s of att.services) {
        await prisma.eventTemplateService.upsert({
          where: { id: s.id },
          update: { matched: s.matched ?? false, matchRequestStatus: s.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: s.matchedAt },
          create: { id: s.id, templateId: att.templateId, serviceId: s.serviceId, matched: s.matched ?? false, matchRequestStatus: s.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: s.matchedAt },
        });
      }
      for (const v of att.venues) {
        await prisma.eventTemplateVenue.upsert({
          where: { id: v.id },
          update: { matched: v.matched ?? false, matchRequestStatus: v.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: v.matchedAt },
          create: { id: v.id, templateId: att.templateId, venueId: v.venueId, matched: v.matched ?? false, matchRequestStatus: v.matchRequestStatus ?? MatchRequestStatus.pending, matchedAt: v.matchedAt },
        });
      }
    }
    console.log("✓ Template assets/services/venues attached with match statuses");

    // ── 4. Events (approved and pending) ────────────────────────────────────
    const now = new Date();
    const events = [
      {
        id: "seed-event-birthday-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.birthday,
        name: "Maria's 30th Birthday Celebration",
        description: "A grand birthday party for 50 guests at Grand Palace Hall.",
        eventCategory: EventCategory.birthday,
        startAt: new Date(now.getTime() + 7  * 86400000),
        endAt:   new Date(now.getTime() + 7  * 86400000 + 6 * 3600000),
        guestCount: 50,
        totalAmount: 75000,
        requestStatus: RequestStatus.approved,
        eventStatus:   EventStatus.pending,
        targetCity: "Manila", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: "seed-event-corporate-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.corporate,
        name: "Q3 Team Strategy Summit",
        description: "Quarterly strategy meeting for 30 team members at The Loft BGC.",
        eventCategory: EventCategory.corporate,
        startAt: new Date(now.getTime() + 14 * 86400000),
        endAt:   new Date(now.getTime() + 14 * 86400000 + 8 * 3600000),
        guestCount: 30,
        totalAmount: 60000,
        requestStatus: RequestStatus.approved,
        eventStatus:   EventStatus.pending,
        targetCity: "Taguig", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: "seed-event-social-01",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.social,
        name: "Summer Rooftop Social",
        description: "A chill rooftop social for friends and colleagues.",
        eventCategory: EventCategory.social,
        startAt: new Date(now.getTime() + 3  * 86400000),
        endAt:   new Date(now.getTime() + 3  * 86400000 + 4 * 3600000),
        guestCount: 80,
        totalAmount: 40000,
        requestStatus: RequestStatus.approved,
        eventStatus:   EventStatus.pending,
        targetCity: "Taguig", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      // ── Pending (awaiting admin approval) ─────────────────────────────────
      {
        id: "seed-event-wedding-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.wedding,
        name: "Garcia-Reyes Wedding Reception",
        description: "Elegant wedding reception for 120 guests at a beachfront venue.",
        eventCategory: EventCategory.wedding,
        startAt: new Date(now.getTime() + 30 * 86400000),
        endAt:   new Date(now.getTime() + 30 * 86400000 + 8 * 3600000),
        guestCount: 120,
        totalAmount: 150000,
        requestStatus: RequestStatus.pending,
        eventStatus:   EventStatus.pending,
        targetCity: "Boracay", targetState: "Aklan", targetCountry: "Philippines",
      },
      {
        id: "seed-event-corporate-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.corporate,
        name: "Tech Startup Demo Day 2026",
        description: "Annual startup pitch and product demo event for investors and press.",
        eventCategory: EventCategory.corporate,
        startAt: new Date(now.getTime() + 21 * 86400000),
        endAt:   new Date(now.getTime() + 21 * 86400000 + 6 * 3600000),
        guestCount: 200,
        totalAmount: 80000,
        requestStatus: RequestStatus.pending,
        eventStatus:   EventStatus.pending,
        targetCity: "Taguig", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: "seed-event-social-pending",
        clientId: client.id,
        organizerId: host.id,
        templateId: TEMPLATE_IDS.social,
        name: "Cebu Food & Music Festival",
        description: "A weekend social festival featuring local food vendors and live music.",
        eventCategory: EventCategory.social,
        startAt: new Date(now.getTime() + 45 * 86400000),
        endAt:   new Date(now.getTime() + 45 * 86400000 + 10 * 3600000),
        guestCount: 500,
        totalAmount: 200000,
        requestStatus: RequestStatus.pending,
        eventStatus:   EventStatus.pending,
        targetCity: "Cebu City", targetState: "Cebu", targetCountry: "Philippines",
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
          eventStatus: e.eventStatus,
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
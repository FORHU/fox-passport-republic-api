import { PrismaClient, EventCategory, RequestStatus, EventStatus, MatchRequestStatus } from "@prisma/client";

// ── Deterministic IDs ────────────────────────────────────────────────────────
const TEMPLATE_IDS = {
  birthday:  "seed-template-birthday",
  wedding:   "seed-template-wedding",
  corporate: "seed-template-corporate",
  social:    "seed-template-social",
  other:     "seed-template-other",
  customGala:       "seed-template-custom-gala",
  customFundraiser: "seed-template-custom-fundraiser",
  customLaunch:     "seed-template-custom-product-launch",
  customReunion:    "seed-template-custom-family-reunion",
  customRetreat:    "seed-template-custom-team-retreat",
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
      {
        id: TEMPLATE_IDS.customGala,
        name: "Charity Gala Night",
        description: "An elegant black-tie gala with a stunning venue, live auction stage, premium catering, and red-carpet photography for a memorable fundraiser evening.",
        category: EventCategory.other,
        targetCity: "Makati", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.customFundraiser,
        name: "Community Fundraiser Bash",
        description: "A fun community-driven fundraiser with live entertainment, food stalls, a raffle stage, and full event coordination to maximize donations and engagement.",
        category: EventCategory.other,
        targetCity: "Quezon City", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.customLaunch,
        name: "Product Launch Spectacular",
        description: "A high-impact product launch with LED backdrop walls, stage lighting, AV production, press-friendly photo ops, and full event styling to impress media and guests.",
        category: EventCategory.other,
        targetCity: "Taguig", targetState: "Metro Manila", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.customReunion,
        name: "Family Reunion Fiesta",
        description: "A warm and nostalgic family reunion with outdoor garden seating, live acoustic music, Filipino feast catering, and photo booth fun for all ages.",
        category: EventCategory.other,
        targetCity: "Cebu City", targetState: "Cebu", targetCountry: "Philippines",
      },
      {
        id: TEMPLATE_IDS.customRetreat,
        name: "Corporate Team Retreat",
        description: "An immersive team-building retreat in a scenic mountain venue with adventure activities, catering, bonfire setup, and full overnight logistics coordination.",
        category: EventCategory.other,
        targetCity: "Baguio City", targetState: "Benguet", targetCountry: "Philippines",
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

      // ── Batch 2 (for pagination testing — page 2+) ─────────────────────
      { suffix: "corporate-manila-2", name: "Board Meeting Manila", desc: "Professional board meeting setup with projector and conference table.", category: EventCategory.corporate, city: "Manila", state: "Metro Manila" },
      { suffix: "birthday-cebu-2", name: "Fiesta Birthday Cebu", desc: "Colorful birthday bash with local Cebuano flair and catering.", category: EventCategory.birthday, city: "Cebu City", state: "Cebu" },
      { suffix: "wedding-davao-2", name: "Sunset Wedding Davao", desc: "Romantic sunset wedding at a Davao garden resort.", category: EventCategory.wedding, city: "Davao City", state: "Davao del Sur" },
      { suffix: "social-baguio-2", name: "Bonfire Night Baguio", desc: "Cozy outdoor bonfire gathering in the Baguio highlands.", category: EventCategory.social, city: "Baguio", state: "Benguet" },
      { suffix: "other-clark-2", name: "Team Building Clark", desc: "Action-packed team building event at Clark Freeport.", category: EventCategory.other, city: "Clark", state: "Pampanga" },
      { suffix: "corporate-davao-2", name: "Sales Kickoff Davao", desc: "High-energy sales kickoff with AV and stage setup.", category: EventCategory.corporate, city: "Davao City", state: "Davao del Sur" },
      { suffix: "birthday-manila-2", name: "First Birthday Manila", desc: "Adorable first birthday celebration with themed decor.", category: EventCategory.birthday, city: "Manila", state: "Metro Manila" },
      { suffix: "wedding-cebu-2", name: "Garden Wedding Cebu", desc: "Lush garden wedding in a Cebu countryside estate.", category: EventCategory.wedding, city: "Cebu City", state: "Cebu" },
      { suffix: "social-makati-2", name: "Rooftop Party Makati", desc: "Vibrant rooftop party with skyline views and cocktails.", category: EventCategory.social, city: "Makati", state: "Metro Manila" },
      { suffix: "other-cebu-2", name: "Harvest Festival Cebu", desc: "Community harvest festival with food stalls and entertainment.", category: EventCategory.other, city: "Cebu City", state: "Cebu" },
      { suffix: "wedding-manila-2", name: "Cathedral Wedding Manila", desc: "Classic cathedral wedding in historic Intramuros.", category: EventCategory.wedding, city: "Manila", state: "Metro Manila" },
      { suffix: "social-cebu-2", name: "Beach Bonfire Cebu", desc: "Relaxed beachside bonfire with acoustic music.", category: EventCategory.social, city: "Cebu City", state: "Cebu" },
      { suffix: "corporate-baguio-2", name: "Strategy Retreat Baguio", desc: "Executive strategy retreat with mountain lodge setup.", category: EventCategory.corporate, city: "Baguio", state: "Benguet" },
      { suffix: "birthday-makati-2", name: "Quinceañera Makati", desc: "Elegant 15th birthday celebration in a Makati ballroom.", category: EventCategory.birthday, city: "Makati", state: "Metro Manila" },
      { suffix: "other-manila-2", name: "Film Screening Manila", desc: "Private film screening event with red carpet setup.", category: EventCategory.other, city: "Manila", state: "Metro Manila" },
      { suffix: "corporate-makati-2", name: "Awards Night Makati", desc: "Glamorous corporate awards night with dinner and show.", category: EventCategory.corporate, city: "Makati", state: "Metro Manila" },
      { suffix: "birthday-cebu-3", name: "Surprise Party Cebu", desc: "Secret surprise party with full decoy setup and catering.", category: EventCategory.birthday, city: "Cebu City", state: "Cebu" },
      { suffix: "wedding-baguio-2", name: "Pine Forest Wedding Baguio", desc: "Enchanting wedding among Benguet pine trees.", category: EventCategory.wedding, city: "Baguio", state: "Benguet" },
      { suffix: "social-clark-2", name: "Music Festival Clark", desc: "Multi-band outdoor music festival at Clark.", category: EventCategory.social, city: "Clark", state: "Pampanga" },
      { suffix: "other-davao-2", name: "Food Fair Davao", desc: "Gourmet food fair with tasting stations and demos.", category: EventCategory.other, city: "Davao City", state: "Davao del Sur" },
      { suffix: "wedding-clark-2", name: "Ranch Wedding Clark", desc: "Rustic ranch-style wedding with open-air chapel.", category: EventCategory.wedding, city: "Clark", state: "Pampanga" },
      { suffix: "social-davao-2", name: "Cultural Night Davao", desc: "Celebration of Mindanao culture with performances and feasts.", category: EventCategory.social, city: "Davao City", state: "Davao del Sur" },
      { suffix: "corporate-cebu-2", name: "Product Demo Cebu", desc: "Product demonstration event with interactive booths.", category: EventCategory.corporate, city: "Cebu City", state: "Cebu" },
      { suffix: "birthday-baguio-2", name: "Retirement Party Baguio", desc: "Heartwarming retirement celebration in a Baguio café.", category: EventCategory.birthday, city: "Baguio", state: "Benguet" },
      { suffix: "other-makati-2", name: "Art Auction Makati", desc: "Charity art auction with gallery walkthrough and wine.", category: EventCategory.other, city: "Makati", state: "Metro Manila" },
      { suffix: "wedding-cebu-3", name: "Cliffside Wedding Cebu", desc: "Dramatic cliffside ceremony overlooking the Cebu sea.", category: EventCategory.wedding, city: "Cebu City", state: "Cebu" },
      { suffix: "social-manila-2", name: "Comedy Night Manila", desc: "Stand-up comedy night with top Filipino comedians.", category: EventCategory.social, city: "Manila", state: "Metro Manila" },
      { suffix: "corporate-davao-3", name: "Innovation Summit Davao", desc: "Tech and innovation summit with demo pods and talks.", category: EventCategory.corporate, city: "Davao City", state: "Davao del Sur" },
      { suffix: "birthday-clark-2", name: "Graduation Party Clark", desc: "Graduation celebration with photo wall and buffet.", category: EventCategory.birthday, city: "Clark", state: "Pampanga" },
      { suffix: "other-clark-3", name: "Holiday Market Clark", desc: "Seasonal holiday market with artisan stalls and caroling.", category: EventCategory.other, city: "Clark", state: "Pampanga" },
      { suffix: "wedding-manila-3", name: "Garden Wedding Manila", desc: "Romantic garden wedding in Manila's botanical park.", category: EventCategory.wedding, city: "Manila", state: "Metro Manila" },
      { suffix: "social-cebu-3", name: "Fiesta Night Cebu", desc: "Traditional Cebuano fiesta with lechon and Sinulog dance.", category: EventCategory.social, city: "Cebu City", state: "Cebu" },
      { suffix: "corporate-davao-4", name: "Tech Conference Davao", desc: "Multi-track tech conference with breakout sessions.", category: EventCategory.corporate, city: "Davao City", state: "Davao del Sur" },
      { suffix: "birthday-baguio-3", name: "Kiddie Party Baguio", desc: "Fun-filled kids' party at a Baguio playground venue.", category: EventCategory.birthday, city: "Baguio", state: "Benguet" },
      { suffix: "other-manila-3", name: "Art Exhibit Manila", desc: "Contemporary art exhibit with gallery openings.", category: EventCategory.other, city: "Manila", state: "Metro Manila" },
      { suffix: "corporate-makati-3", name: "Product Launch Makati", desc: "High-profile product launch with media coverage.", category: EventCategory.corporate, city: "Makati", state: "Metro Manila" },
      { suffix: "social-makati-3", name: "Rooftop Social Makati", desc: "Chic rooftop social with cocktails and skyline views.", category: EventCategory.social, city: "Makati", state: "Metro Manila" },
      { suffix: "wedding-davao-3", name: "Rustic Wedding Davao", desc: "Rustic barn wedding with farm-to-table catering.", category: EventCategory.wedding, city: "Davao City", state: "Davao del Sur" },
      { suffix: "birthday-manila-3", name: "Debut Manila", desc: "Elegant 18th birthday debut with live band.", category: EventCategory.birthday, city: "Manila", state: "Metro Manila" },
      { suffix: "other-baguio-2", name: "Cultural Night Baguio", desc: "Igorot cultural showcase with traditional dances.", category: EventCategory.other, city: "Baguio", state: "Benguet" },
      { suffix: "corporate-clark-2", name: "Business Summit Clark", desc: "Regional business summit with keynote speakers.", category: EventCategory.corporate, city: "Clark", state: "Pampanga" },
      { suffix: "social-clark-3", name: "Outdoor Concert Clark", desc: "Open-air concert at Clark with multiple stages.", category: EventCategory.social, city: "Clark", state: "Pampanga" },
      { suffix: "wedding-baguio-3", name: "Mountain Wedding Baguio", desc: "Scenic mountain wedding with panoramic Cordillera views.", category: EventCategory.wedding, city: "Baguio", state: "Benguet" },
      { suffix: "birthday-davao-2", name: "Debut Gala Davao", desc: "Glamorous debut gala at a Davao waterfront hotel.", category: EventCategory.birthday, city: "Davao City", state: "Davao del Sur" },
      { suffix: "social-manila-3", name: "Reunion Night Manila", desc: "Nostalgic reunion night with OPM hits and karaoke.", category: EventCategory.social, city: "Manila", state: "Metro Manila" },
      { suffix: "other-cebu-3", name: "Food Festival Cebu", desc: "Annual food festival with cooking demos and tastings.", category: EventCategory.other, city: "Cebu City", state: "Cebu" },
      { suffix: "corporate-baguio-3", name: "Leadership Summit Baguio", desc: "Executive leadership retreat in the Cordillera mountains.", category: EventCategory.corporate, city: "Baguio", state: "Benguet" },
      { suffix: "wedding-makati-2", name: "Garden Wedding Makati", desc: "Elegant garden wedding in a Makati courtyard.", category: EventCategory.wedding, city: "Makati", state: "Metro Manila" },
      { suffix: "social-davao-3", name: "Summer Social Davao", desc: "Tropical summer poolside social with BBQ.", category: EventCategory.social, city: "Davao City", state: "Davao del Sur" },
      { suffix: "birthday-clark-3", name: "Sweet 16 Clark", desc: "Sweet sixteen celebration with themed decor.", category: EventCategory.birthday, city: "Clark", state: "Pampanga" },
      { suffix: "corporate-makati-4", name: "Corporate Gala Makati", desc: "Black-tie corporate gala with dinner and awards.", category: EventCategory.corporate, city: "Makati", state: "Metro Manila" },
      { suffix: "other-baguio-3", name: "Cultural Festival Baguio", desc: "Panagbenga-inspired cultural festival event.", category: EventCategory.other, city: "Baguio", state: "Benguet" },
      { suffix: "wedding-cebu-4", name: "Beach Wedding Cebu", desc: "Tropical beach wedding with white sand and sunset.", category: EventCategory.wedding, city: "Cebu City", state: "Cebu" },
      { suffix: "social-manila-4", name: "Pool Party Manila", desc: "Summer poolside bash with DJ and cocktails.", category: EventCategory.social, city: "Manila", state: "Metro Manila" },
      { suffix: "birthday-cebu-4", name: "Fiesta Birthday Cebu 2", desc: "Grand Cebuano birthday fiesta with lechon feast.", category: EventCategory.birthday, city: "Cebu City", state: "Cebu" },
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
      [TEMPLATE_IDS.customGala]: [
        { id: "seed-file-custom-gala-1", url: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop", name: "Gala Dinner Hall" },
        { id: "seed-file-custom-gala-2", url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop", name: "Red Carpet Setup" },
        { id: "seed-file-custom-gala-3", url: "https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=800&auto=format&fit=crop", name: "Auction Stage" },
      ],
      [TEMPLATE_IDS.customFundraiser]: [
        { id: "seed-file-custom-fundraiser-1", url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop", name: "Community Event" },
        { id: "seed-file-custom-fundraiser-2", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop", name: "Live Entertainment" },
        { id: "seed-file-custom-fundraiser-3", url: "https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?w=800&auto=format&fit=crop", name: "Food Stalls" },
      ],
      [TEMPLATE_IDS.customLaunch]: [
        { id: "seed-file-custom-launch-1", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop", name: "Product Stage" },
        { id: "seed-file-custom-launch-2", url: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop", name: "LED Backdrop" },
        { id: "seed-file-custom-launch-3", url: "https://images.unsplash.com/photo-1559223607-b4d0555ae227?w=800&auto=format&fit=crop", name: "Media Setup" },
      ],
      [TEMPLATE_IDS.customReunion]: [
        { id: "seed-file-custom-reunion-1", url: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&auto=format&fit=crop", name: "Garden Gathering" },
        { id: "seed-file-custom-reunion-2", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop", name: "Acoustic Music" },
        { id: "seed-file-custom-reunion-3", url: "https://images.unsplash.com/photo-1555244162-803834f70033?w=800&auto=format&fit=crop", name: "Feast Table" },
      ],
      [TEMPLATE_IDS.customRetreat]: [
        { id: "seed-file-custom-retreat-1", url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop", name: "Mountain Venue" },
        { id: "seed-file-custom-retreat-2", url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop", name: "Adventure Activity" },
        { id: "seed-file-custom-retreat-3", url: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&auto=format&fit=crop", name: "Bonfire Night" },
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
      {
        templateId: TEMPLATE_IDS.customGala,
        assets:   [
          { id: "seed-ta-gala-speakers", assetId: ASSET_IDS.speakers, quantity: 2 },
          { id: "seed-ta-gala-lights",   assetId: ASSET_IDS.lights,   quantity: 4 },
        ],
        services: [
          { id: "seed-ts-gala-photo",    serviceId: SERVICE_IDS.photo },
          { id: "seed-ts-gala-catering", serviceId: SERVICE_IDS.catering },
        ],
        venues: [{ id: "seed-tv-gala-palace", venueId: VENUE_IDS.palace }],
      },
      {
        templateId: TEMPLATE_IDS.customFundraiser,
        assets:   [
          { id: "seed-ta-fundraiser-speakers", assetId: ASSET_IDS.speakers, quantity: 2 },
          { id: "seed-ta-fundraiser-lights",   assetId: ASSET_IDS.lights,   quantity: 3 },
        ],
        services: [
          { id: "seed-ts-fundraiser-band",     serviceId: SERVICE_IDS.band },
          { id: "seed-ts-fundraiser-catering", serviceId: SERVICE_IDS.catering },
        ],
        venues: [{ id: "seed-tv-fundraiser-gazebo", venueId: VENUE_IDS.gazebo }],
      },
      {
        templateId: TEMPLATE_IDS.customLaunch,
        assets:   [
          { id: "seed-ta-launch-speakers", assetId: ASSET_IDS.speakers, quantity: 2 },
          { id: "seed-ta-launch-lights",   assetId: ASSET_IDS.lights,   quantity: 6 },
        ],
        services: [
          { id: "seed-ts-launch-photo",    serviceId: SERVICE_IDS.photo },
          { id: "seed-ts-launch-catering", serviceId: SERVICE_IDS.catering },
        ],
        venues: [{ id: "seed-tv-launch-loft", venueId: VENUE_IDS.loft }],
      },
      {
        templateId: TEMPLATE_IDS.customReunion,
        assets:   [
          { id: "seed-ta-reunion-speakers", assetId: ASSET_IDS.speakers, quantity: 1 },
          { id: "seed-ta-reunion-lights",   assetId: ASSET_IDS.lights,   quantity: 2 },
        ],
        services: [
          { id: "seed-ts-reunion-band",     serviceId: SERVICE_IDS.band },
          { id: "seed-ts-reunion-catering", serviceId: SERVICE_IDS.catering },
        ],
        venues: [{ id: "seed-tv-reunion-gazebo", venueId: VENUE_IDS.gazebo }],
      },
      {
        templateId: TEMPLATE_IDS.customRetreat,
        assets:   [
          { id: "seed-ta-retreat-speakers", assetId: ASSET_IDS.speakers, quantity: 1 },
          { id: "seed-ta-retreat-lights",   assetId: ASSET_IDS.lights,   quantity: 2 },
        ],
        services: [
          { id: "seed-ts-retreat-catering", serviceId: SERVICE_IDS.catering },
          { id: "seed-ts-retreat-photo",    serviceId: SERVICE_IDS.photo },
        ],
        venues: [{ id: "seed-tv-retreat-gazebo", venueId: VENUE_IDS.gazebo }],
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
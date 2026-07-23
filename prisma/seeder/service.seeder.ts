import { PrismaClient, ServiceStatus, BillingRate, ServiceCategory } from "@prisma/client";

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Manila":        { lat: 14.5995, lng: 120.9842 },
  "Taguig":        { lat: 14.5176, lng: 121.0509 },
  "Quezon City":   { lat: 14.6760, lng: 121.0437 },
  "Makati":        { lat: 14.5547, lng: 121.0244 },
  "Baguio City":   { lat: 16.4023, lng: 120.5960 },
  "Pasig":         { lat: 14.5764, lng: 121.0851 },
  "Cebu City":     { lat: 10.3157, lng: 123.8854 },
  "Mandaluyong":   { lat: 14.5794, lng: 121.0359 },
  "Pasay":         { lat: 14.5378, lng: 121.0014 },
  "Davao City":    { lat: 7.1907,  lng: 125.4553 },
};

export async function seedServices(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting service seed...");
    const serviceFoxer = users.find(u => u.email === "servicefoxer@example.com");
    if (!serviceFoxer) throw new Error("Service foxer user not found for service seeding");

    const gearFoxer = users.find(u => u.email === "gearfoxer@example.com");
    const jasmine = users.find(u => u.email === "jasmine.reyes@foxers.ph");
    const marco = users.find(u => u.email === "marco.santos@foxers.ph");
    const sarah = users.find(u => u.email === "sarah.lim@foxers.ph");

    const services = [
      // ── serviceFoxer Cruz (existing) ──────────────────────────────────────
      {
        id: "seed-service-manila-event-photography",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Manila Event Photography",
        description: "Professional event photography and videography coverage in Metro Manila.",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["photography", "videography", "events"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-metro-manila-premium-catering",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Metro Manila Premium Catering",
        description: "Full-service gourmet catering with Filipino and international cuisine.",
        price: 800,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["catering", "food", "buffet"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-live-band-performance",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Live Band Performance",
        description: "5-piece live band covering OPM, pop, and jazz for corporate and social events.",
        price: 25000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["band", "live music", "entertainment"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-event-waitstaff-team",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.service_staff,
        name: "Event Waitstaff Team",
        description: "Trained and uniformed waitstaff for banquets and cocktail events.",
        price: 600,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["staff", "waiters", "service"],
        isWillingToTravel: false,
      },
      // ── Experience Builder: Food & Drink ──────────────────────────────────
      {
        id: "seed-service-neon-cocktail-bar",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Neon Cocktail Bar",
        description: "UV-lit cocktail bar with signature neon-themed drinks and professional bartenders.",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["cocktails", "bar", "neon", "drinks"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-midnight-ramen-station",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Midnight Ramen Station",
        description: "Late-night ramen station with customizable bowls — the ultimate post-party fuel.",
        price: 8000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["ramen", "food", "late night", "catering"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-sushi-platter-deluxe",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Sushi Platter Deluxe",
        description: "Premium sushi and sashimi platters crafted by a Japanese-trained chef for your event.",
        price: 12000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["sushi", "japanese", "premium", "food"],
        isWillingToTravel: false,
      },
      // ── Experience Builder: Tech & AV ──────────────────────────────────────
      {
        id: "seed-service-funktion-one-sound",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Funktion-One Sound System",
        description: "Club-grade Funktion-One speaker setup with professional sound engineer included.",
        price: 25000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["sound", "audio", "club", "speakers"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-silent-disco-gear",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Silent Disco Gear (30 Headsets)",
        description: "30 wireless headsets with 3-channel silent disco setup for an immersive audio experience.",
        price: 18000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["silent disco", "headsets", "unique", "music"],
        isWillingToTravel: true,
      },
      // ── Experience Builder: Decor & Style ─────────────────────────────────
      {
        id: "seed-service-cyberpunk-props",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.design,
        name: "Cyberpunk Prop Collection",
        description: "Neon signs, holographic panels, and futuristic prop set to transform any space.",
        price: 20000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["decor", "cyberpunk", "neon", "props"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-luxury-lounge-seating",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.design,
        name: "Luxury Lounge Seating Setup",
        description: "Modular velvet lounge furniture and low tables — perfect for VIP areas and chill zones.",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["lounge", "furniture", "luxury", "seating"],
        isWillingToTravel: false,
      },
      // ── Experience Builder: Photo & Video ─────────────────────────────────
      {
        id: "seed-service-film-photo-booth",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Vintage Film Photo Booth",
        description: "Analog-style photo booth with physical film prints — a timeless keepsake for guests.",
        price: 10000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["photo booth", "film", "vintage", "prints"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-aftermovie-drone",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Drone Aftermovie Coverage",
        description: "Cinematic aerial coverage + on-the-ground camera crew for a stunning post-event film.",
        price: 22000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["drone", "aerial", "aftermovie", "video"],
        isWillingToTravel: true,
      },
      // ── Pending (awaiting admin approval) ──────────────────────────────────
      {
        id: "seed-service-event-styling-design",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.design,
        name: "Event Styling & Design",
        description: "Full event styling and design service — concept to setup.",
        price: 18000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.pending,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["styling", "design", "decor"],
        isWillingToTravel: true,
      },
      {
        id: "seed-service-cebu-lechon-kamayan",
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Cebu Lechon & Kamayan",
        description: "Authentic Cebu lechon and traditional kamayan feast catering.",
        price: 1200,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.pending,
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
        tags: ["lechon", "kamayan", "filipino food"],
        isWillingToTravel: false,
      },

      // ── Gear Foxer Dela Rosa (foxerAsset) ────────────────────────────────
      ...(gearFoxer ? [
        {
          id: "seed-service-gear-lacoustics-sound",
          ownerId: gearFoxer.id,
          category: ServiceCategory.entertainment,
          name: "L-Acoustics Sound System",
          description: "Acoustic vibes for sunset or electric beats for the after-party. I provide high-end audio equipment and state-of-the-art lighting to transform any space.",
          price: 28000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Quezon City",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["sound", "L-Acoustics", "audio engineering", "speakers"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-gear-dmx-lighting",
          ownerId: gearFoxer.id,
          category: ServiceCategory.entertainment,
          name: "DMX Stage Lighting Rig",
          description: "Full DMX-controlled lighting rig with moving heads, LED wash, and haze machine for concert-level atmosphere.",
          price: 20000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Quezon City",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["DMX lighting", "stage setup", "visual projection"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-gear-generator-power",
          ownerId: gearFoxer.id,
          category: ServiceCategory.entertainment,
          name: "Industrial Generator (50kVA)",
          description: "Reliable backup power for outdoor events — 50kVA silent diesel generator with full cable management.",
          price: 12000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Quezon City",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["generator", "power", "outdoor events"],
          isWillingToTravel: true,
        },
      ] : []),

      // ── Jasmine Reyes (foxerService) ─────────────────────────────────────
      ...(jasmine ? [
        {
          id: "seed-service-jasmine-event-production",
          ownerId: jasmine.id,
          category: ServiceCategory.design,
          name: "Full Event Production & Styling",
          description: "I turn pine forests into fairy tales. Specializing in boho camping setups and intimate gatherings. My goal is to ensure your event flow is flawless and aesthetically unmatched.",
          price: 35000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Taguig",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["site management", "floral design", "lighting moods"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-jasmine-table-styling",
          ownerId: jasmine.id,
          category: ServiceCategory.design,
          name: "Table Styling & Decor",
          description: "Curated tablescapes with fresh florals, linen, and fine props tailored to your event theme.",
          price: 12000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Taguig",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["decorations", "table styling", "vendor management"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-jasmine-vendor-coordination",
          ownerId: jasmine.id,
          category: ServiceCategory.service_staff,
          name: "Vendor Coordination & Day-Of Management",
          description: "Full vendor coordination and on-the-day event management so you don't have to lift a finger.",
          price: 18000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Taguig",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["coordination", "management", "vendors"],
          isWillingToTravel: false,
        },
      ] : []),

      // ── Marco Santos (foxerService) ──────────────────────────────────────
      ...(marco ? [
        {
          id: "seed-service-marco-live-trekking",
          ownerId: marco.id,
          category: ServiceCategory.entertainment,
          name: "Guided Outdoor Trekking Experience",
          description: "Leading treks and organizing outdoor activities. I bring the energy and expertise to keep your group safe while pushing the boundaries of adventure.",
          price: 3500,
          currency: "PHP",
          billingRate: BillingRate.daily,
          status: ServiceStatus.available,
          city: "Makati",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["navigation", "survival skills", "group dynamics"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-marco-team-building",
          ownerId: marco.id,
          category: ServiceCategory.entertainment,
          name: "Team Building Workshops",
          description: "High-energy group workshops designed to build trust, communication, and camaraderie in the wild.",
          price: 8000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Makati",
          state: "Metro Manila",
          country: "Philippines",
          tags: ["team building", "workshops", "storytelling"],
          isWillingToTravel: true,
        },
      ] : []),

      // ── Sarah Lim (foxerService) ─────────────────────────────────────────
      ...(sarah ? [
        {
          id: "seed-service-sarah-dj-set",
          ownerId: sarah.id,
          category: ServiceCategory.entertainment,
          name: "Professional DJ Set & Mixing",
          description: "Acoustic vibes for sunset or electric beats for the midnight hour. I read the room and keep the energy exactly where it needs to be — all night long.",
          price: 20000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Cebu City",
          state: "Cebu",
          country: "Philippines",
          tags: ["DJ", "mixing", "music curation", "live sets"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-sarah-live-band",
          ownerId: sarah.id,
          category: ServiceCategory.entertainment,
          name: "Live Acoustic & Electric Band",
          description: "4-piece band covering OPM, indie, and pop. From mellow cocktail sets to full electric performances.",
          price: 30000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Cebu City",
          state: "Cebu",
          country: "Philippines",
          tags: ["live band", "acoustic", "OPM", "entertainment"],
          isWillingToTravel: true,
        },
        {
          id: "seed-service-sarah-soundcheck",
          ownerId: sarah.id,
          category: ServiceCategory.entertainment,
          name: "Full Audio Production & Soundcheck",
          description: "End-to-end audio production including stage monitors, FOH mixing, and pre-event soundcheck coordination.",
          price: 15000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: "Cebu City",
          state: "Cebu",
          country: "Philippines",
          tags: ["audio production", "soundcheck", "FOH mixing"],
          isWillingToTravel: false,
        },
      ] : []),
    ];

    // ── Bulk services for pagination-testing foxers ──────────────────────────
    const EF_SERVICE_NAMES = [
      ["Full Event Coordination", "Day-Of Event Management"],
      ["Wedding Planning Package", "Corporate Event Setup"],
      ["Birthday Party Production", "Social Gathering Package"],
      ["Debut Event Planning", "Festival Coordination"],
      ["Anniversary Celebration", "Reunion Event Setup"],
      ["Concert Event Planning", "Product Launch Package"],
      ["Outdoor Event Coordination", "Virtual Event Production"],
      ["Gala Night Planning", "Team Building Coordination"],
    ];

    const GF_SERVICE_NAMES = [
      ["PA System Rental", "Wireless Mic Set"],
      ["LED Wall Package", "Projector Rental"],
      ["Stage Lighting Rig", "Haze Machine Setup"],
      ["Portable Stage Setup", "Truss System Rental"],
      ["Generator Rental (30kVA)", "Power Distribution Box"],
      ["DJ Equipment Set", "Turntable Package"],
      ["Photo Booth Kiosk", "360 Video Booth"],
      ["Drone Camera Package", "GoPro Multi-Cam Kit"],
      ["Confetti Cannon Set", "CO2 Jet Machine"],
      ["Fog Machine Rental", "Laser Light Show Kit"],
      ["Backdrop Frame Set", "Modular Booth Walls"],
      ["Event Tent (10x10)", "Canopy Rental Package"],
      ["Folding Chair Set (50)", "Round Table Set (10)"],
      ["Cooler & Ice Chest", "Mobile Bar Counter"],
      ["Barrier & Stanchion Set", "Crowd Control Package"],
    ];

    const SF_SERVICE_NAMES = [
      ["Event Photography", "Portrait Session"],
      ["Hair & Makeup", "Bridal Styling"],
      ["Floral Arrangement", "Bouquet Design"],
      ["Catering (Filipino)", "Dessert Buffet"],
      ["Emcee & Hosting", "Stand-Up Comedy Set"],
      ["Bartending Service", "Cocktail Mixology"],
      ["Videography Coverage", "Highlight Reel Edit"],
      ["Face Painting", "Balloon Twisting"],
    ];

    const SVC_CATEGORIES = [
      ServiceCategory.entertainment,
      ServiceCategory.catering,
      ServiceCategory.design,
      ServiceCategory.service_staff,
      ServiceCategory.other,
    ];

    const BILLING_RATES = [BillingRate.one_time, BillingRate.daily, BillingRate.one_time, BillingRate.one_time, BillingRate.daily];

    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `ef-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      const [svcA, svcB] = EF_SERVICE_NAMES[(i - 1) % EF_SERVICE_NAMES.length];
      services.push(
        {
          id: `seed-service-ef-${i}-a`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[i % SVC_CATEGORIES.length],
          name: svcA,
          description: `${svcA} by ${foxer.name}`,
          price: 10000 + i * 2000,
          currency: "PHP",
          billingRate: BILLING_RATES[i % BILLING_RATES.length],
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcA.toLowerCase().split(" ")[0]],
          isWillingToTravel: i % 2 === 0,
        } as any,
        {
          id: `seed-service-ef-${i}-b`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[(i + 1) % SVC_CATEGORIES.length],
          name: svcB,
          description: `${svcB} by ${foxer.name}`,
          price: 5000 + i * 1500,
          currency: "PHP",
          billingRate: BILLING_RATES[(i + 1) % BILLING_RATES.length],
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcB.toLowerCase().split(" ")[0]],
          isWillingToTravel: i % 3 === 0,
        } as any
      );
    }

    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `gf-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      const [svcA, svcB] = GF_SERVICE_NAMES[(i - 1) % GF_SERVICE_NAMES.length];
      services.push(
        {
          id: `seed-service-gf-${i}-a`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[i % SVC_CATEGORIES.length],
          name: svcA,
          description: `${svcA} — provided by ${foxer.name}`,
          price: 3000 + (i % 5) * 2000,
          currency: "PHP",
          billingRate: i % 2 === 0 ? BillingRate.one_time : BillingRate.daily,
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcA.toLowerCase().split(" ")[0]],
          isWillingToTravel: true,
        } as any,
        {
          id: `seed-service-gf-${i}-b`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[(i + 2) % SVC_CATEGORIES.length],
          name: svcB,
          description: `${svcB} — provided by ${foxer.name}`,
          price: 1500 + (i % 3) * 1000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcB.toLowerCase().split(" ")[0]],
          isWillingToTravel: false,
        } as any
      );
    }

    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `sf-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      const [svcA, svcB] = SF_SERVICE_NAMES[(i - 1) % SF_SERVICE_NAMES.length];
      services.push(
        {
          id: `seed-service-sf-${i}-a`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[i % SVC_CATEGORIES.length],
          name: svcA,
          description: `${svcA} by ${foxer.name}`,
          price: 5000 + (i % 4) * 3000,
          currency: "PHP",
          billingRate: i % 2 === 0 ? BillingRate.one_time : BillingRate.daily,
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcA.toLowerCase().split(" ")[0]],
          isWillingToTravel: true,
        } as any,
        {
          id: `seed-service-sf-${i}-b`,
          ownerId: foxer.id,
          category: SVC_CATEGORIES[(i + 1) % SVC_CATEGORIES.length],
          name: svcB,
          description: `${svcB} by ${foxer.name}`,
          price: 8000 + (i % 3) * 4000,
          currency: "PHP",
          billingRate: BillingRate.one_time,
          status: ServiceStatus.available,
          city: (foxer as any).city ?? "Manila",
          state: (foxer as any).state ?? "Metro Manila",
          country: "Philippines",
          tags: [svcB.toLowerCase().split(" ")[0]],
          isWillingToTravel: false,
        } as any
      );
    }

    for (const s of services) {
      const { id, ...rest } = s as any;
      const serviceId = id || `seed-service-${s.name.toLowerCase().replace(/\s+/g, '-')}`;
      const coords = CITY_COORDS[rest.city] ?? {};
      await prisma.service.upsert({
        where: { id: serviceId },
        update: { ...rest, ...coords },
        create: { id: serviceId, ...rest, ...coords },
      });
      console.log(`✓ Seeded service: ${s.name}`);
    }

    // ── Portfolio images for ALL services ───────────────────────────────────
    const serviceImages = [
      // NEW: serviceFoxer Portfolio Images
      { id: "seed-img-manila-photo-1", serviceId: "seed-service-manila-event-photography", url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop", name: "event-photo.jpg", type: "image/jpeg" },
      { id: "seed-img-premium-catering-1", serviceId: "seed-service-metro-manila-premium-catering", url: "https://images.unsplash.com/photo-1555244162-803834f70033?w=800&auto=format&fit=crop", name: "buffet-setup.jpg", type: "image/jpeg" },
      { id: "seed-img-live-band-1", serviceId: "seed-service-live-band-performance", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop", name: "live-band-show.jpg", type: "image/jpeg" },
      { id: "seed-img-waitstaff-1", serviceId: "seed-service-event-waitstaff-team", url: "https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800&auto=format&fit=crop", name: "waitstaff.jpg", type: "image/jpeg" },
      { id: "seed-img-neon-cocktail-1", serviceId: "seed-service-neon-cocktail-bar", url: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&auto=format&fit=crop", name: "neon-drinks.jpg", type: "image/jpeg" },
      { id: "seed-img-ramen-station-1", serviceId: "seed-service-midnight-ramen-station", url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop", name: "ramen-bar.jpg", type: "image/jpeg" },
      { id: "seed-img-sushi-deluxe-1", serviceId: "seed-service-sushi-platter-deluxe", url: "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=800&auto=format&fit=crop", name: "sushi-platter.jpg", type: "image/jpeg" },
      { id: "seed-img-funktion-sound-1", serviceId: "seed-service-funktion-one-sound", url: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&auto=format&fit=crop", name: "funktion-speakers.jpg", type: "image/jpeg" },
      { id: "seed-img-silent-disco-1", serviceId: "seed-service-silent-disco-gear", url: "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800&auto=format&fit=crop", name: "silent-disco.jpg", type: "image/jpeg" },
      { id: "seed-img-cyberpunk-props-1", serviceId: "seed-service-cyberpunk-props", url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop", name: "neon-props.jpg", type: "image/jpeg" },
      { id: "seed-img-lounge-seating-1", serviceId: "seed-service-luxury-lounge-seating", url: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&auto=format&fit=crop", name: "lounge-furniture.jpg", type: "image/jpeg" },
      { id: "seed-img-film-booth-1", serviceId: "seed-service-film-photo-booth", url: "https://images.unsplash.com/photo-1533142266415-ac591a4deae9?w=800&auto=format&fit=crop", name: "vintage-booth.jpg", type: "image/jpeg" },
      { id: "seed-img-drone-aftermovie-1", serviceId: "seed-service-aftermovie-drone", url: "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop", name: "drone-aerial.jpg", type: "image/jpeg" },
      { id: "seed-img-event-styling-1", serviceId: "seed-service-event-styling-design", url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop", name: "design-setup.jpg", type: "image/jpeg" },
      { id: "seed-img-cebu-lechon-1", serviceId: "seed-service-cebu-lechon-kamayan", url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop", name: "kamayan-feast.jpg", type: "image/jpeg" },

      // Gear Foxer — sound & lighting portfolio
      { id: "seed-img-gear-sound-1", serviceId: "seed-service-gear-lacoustics-sound", url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&auto=format&fit=crop", name: "stage-sound.jpg", type: "image/jpeg" },
      { id: "seed-img-gear-sound-2", serviceId: "seed-service-gear-lacoustics-sound", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop", name: "concert-rig.jpg", type: "image/jpeg" },
      { id: "seed-img-gear-lighting-1", serviceId: "seed-service-gear-dmx-lighting", url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop", name: "dmx-lights.jpg", type: "image/jpeg" },
      { id: "seed-img-gear-lighting-2", serviceId: "seed-service-gear-dmx-lighting", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop", name: "stage-rig.jpg", type: "image/jpeg" },
      { id: "seed-img-gear-gen-1", serviceId: "seed-service-gear-generator-power", url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=800&auto=format&fit=crop", name: "outdoor-setup.jpg", type: "image/jpeg" },

      // Jasmine Reyes — event styling portfolio
      { id: "seed-img-jasmine-prod-1", serviceId: "seed-service-jasmine-event-production", url: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&auto=format&fit=crop", name: "event-styled.jpg", type: "image/jpeg" },
      { id: "seed-img-jasmine-prod-2", serviceId: "seed-service-jasmine-event-production", url: "https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=800&auto=format&fit=crop", name: "floral-decor.jpg", type: "image/jpeg" },
      { id: "seed-img-jasmine-table-1", serviceId: "seed-service-jasmine-table-styling", url: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=800&auto=format&fit=crop", name: "tablescape.jpg", type: "image/jpeg" },
      { id: "seed-img-jasmine-table-2", serviceId: "seed-service-jasmine-table-styling", url: "https://images.unsplash.com/photo-1561489413-985b06da5bee?w=800&auto=format&fit=crop", name: "reception.jpg", type: "image/jpeg" },
      { id: "seed-img-jasmine-coord-1", serviceId: "seed-service-jasmine-vendor-coordination", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop", name: "coordination.jpg", type: "image/jpeg" },

      // Marco Santos — outdoor / team building portfolio
      { id: "seed-img-marco-trek-1", serviceId: "seed-service-marco-live-trekking", url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop", name: "mountain-trek.jpg", type: "image/jpeg" },
      { id: "seed-img-marco-trek-2", serviceId: "seed-service-marco-live-trekking", url: "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=800&auto=format&fit=crop", name: "outdoor-group.jpg", type: "image/jpeg" },
      { id: "seed-img-marco-team-1", serviceId: "seed-service-marco-team-building", url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&auto=format&fit=crop", name: "team-activity.jpg", type: "image/jpeg" },
      { id: "seed-img-marco-team-2", serviceId: "seed-service-marco-team-building", url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop", name: "workshop.jpg", type: "image/jpeg" },

      // Sarah Lim — music & audio portfolio
      { id: "seed-img-sarah-dj-1", serviceId: "seed-service-sarah-dj-set", url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop", name: "dj-performance.jpg", type: "image/jpeg" },
      { id: "seed-img-sarah-dj-2", serviceId: "seed-service-sarah-dj-set", url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop", name: "mixing-board.jpg", type: "image/jpeg" },
      { id: "seed-img-sarah-band-1", serviceId: "seed-service-sarah-live-band", url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop", name: "live-band.jpg", type: "image/jpeg" },
      { id: "seed-img-sarah-band-2", serviceId: "seed-service-sarah-live-band", url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&auto=format&fit=crop", name: "band-stage.jpg", type: "image/jpeg" },
      { id: "seed-img-sarah-sound-1", serviceId: "seed-service-sarah-soundcheck", url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop", name: "foh-mixing.jpg", type: "image/jpeg" },
      { id: "seed-img-sarah-sound-2", serviceId: "seed-service-sarah-soundcheck", url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&auto=format&fit=crop", name: "stage-monitors.jpg", type: "image/jpeg" },
    ];

    // ── Bulk portfolio images for pagination-testing services ────────────────
    const EVENT_PHOTO_URLS = [
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop",
    ];

    const GEAR_PHOTO_URLS = [
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop",
    ];

    const SERVICE_PHOTO_URLS = [
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1555244162-803834f70033?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1533142266415-ac591a4deae9?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=800&auto=format&fit=crop",
    ];

    // Event foxer service images
    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `ef-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      serviceImages.push(
        { id: `seed-img-ef-${i}-a`, serviceId: `seed-service-ef-${i}-a`, url: EVENT_PHOTO_URLS[(i - 1) % EVENT_PHOTO_URLS.length], name: `ef-${i}-portfolio-a.jpg`, type: "image/jpeg" },
        { id: `seed-img-ef-${i}-b`, serviceId: `seed-service-ef-${i}-b`, url: EVENT_PHOTO_URLS[i % EVENT_PHOTO_URLS.length], name: `ef-${i}-portfolio-b.jpg`, type: "image/jpeg" },
      );
    }

    // Gear foxer service images
    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `gf-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      serviceImages.push(
        { id: `seed-img-gf-${i}-a`, serviceId: `seed-service-gf-${i}-a`, url: GEAR_PHOTO_URLS[(i - 1) % GEAR_PHOTO_URLS.length], name: `gf-${i}-portfolio-a.jpg`, type: "image/jpeg" },
        { id: `seed-img-gf-${i}-b`, serviceId: `seed-service-gf-${i}-b`, url: GEAR_PHOTO_URLS[i % GEAR_PHOTO_URLS.length], name: `gf-${i}-portfolio-b.jpg`, type: "image/jpeg" },
      );
    }

    // Service foxer service images
    for (let i = 1; i <= 60; i++) {
      const foxer = users.find((u: any) => u.email === `sf-${String(i).padStart(2, "0")}@foxers.ph`);
      if (!foxer) continue;
      serviceImages.push(
        { id: `seed-img-sf-${i}-a`, serviceId: `seed-service-sf-${i}-a`, url: SERVICE_PHOTO_URLS[(i - 1) % SERVICE_PHOTO_URLS.length], name: `sf-${i}-portfolio-a.jpg`, type: "image/jpeg" },
        { id: `seed-img-sf-${i}-b`, serviceId: `seed-service-sf-${i}-b`, url: SERVICE_PHOTO_URLS[i % SERVICE_PHOTO_URLS.length], name: `sf-${i}-portfolio-b.jpg`, type: "image/jpeg" },
      );
    }

    for (const img of serviceImages) {
      await prisma.file.upsert({
        where: { id: img.id },
        update: { url: img.url },
        create: img,
      });
    }
    console.log(`✓ Seeded ${serviceImages.length} portfolio images`);

    console.log("✅ Service seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding services:", error);
    throw error;
  }
}
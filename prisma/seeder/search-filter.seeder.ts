import { PrismaClient, EventCategory, AssetCategory, ServiceCategory, EventTemplateStatus, AssetStatus, ServiceStatus, BillingRate } from "@prisma/client";

export async function seedSearchFilters(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting search-filter seed...");

    // ── 1. Event Templates ──────────────────────────────────────────────────
    const eventFoxers = users.filter((u: any) => (u.email as string).startsWith("ef-"));
    const templateOwner = eventFoxers[0] ?? users.find(u => u.email === "host@example.com");
    if (!templateOwner) throw new Error("No event foxer found for search-filter template seeding");

    const templates = [
      // ── Published + Public (should appear in search) ─────────────────────
      { id: "sf-template-corporate-manila", name: "SF Corporate Summit Manila", description: "Search-filter test: corporate event in Manila.", category: EventCategory.corporate, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-cebu", name: "SF Birthday Bash Cebu", description: "Search-filter test: birthday event in Cebu City.", category: EventCategory.birthday, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-wedding-davao", name: "SF Wedding Bliss Davao", description: "Search-filter test: wedding event in Davao City.", category: EventCategory.wedding, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-bagio", name: "SF Social Night Baguio", description: "Search-filter test: social event in Baguio.", category: EventCategory.social, targetCity: "Baguio", targetState: "Benguet", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-clark", name: "SF Custom Event Clark", description: "Search-filter test: custom/other event in Clark.", category: EventCategory.other, targetCity: "Clark", targetState: "Pampanga", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-makati", name: "SF Custom Celebration Makati", description: "Search-filter test: custom/other event in Makati.", category: EventCategory.other, targetCity: "Makati", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-corporate-cebu", name: "SF Corporate Launch Cebu", description: "Search-filter test: corporate event in Cebu City.", category: EventCategory.corporate, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-manila", name: "SF Debut Manila", description: "Search-filter test: birthday event in Manila.", category: EventCategory.birthday, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },

      // ── Extra published + public (for pagination testing) ─────────────────
      { id: "sf-template-wedding-manila", name: "SF Garden Wedding Manila", description: "Search-filter test: wedding event in Manila.", category: EventCategory.wedding, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-cebu", name: "SF Fiesta Night Cebu", description: "Search-filter test: social event in Cebu City.", category: EventCategory.social, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-corporate-davao", name: "SF Tech Conference Davao", description: "Search-filter test: corporate event in Davao City.", category: EventCategory.corporate, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-bagio", name: "SF Kiddie Party Baguio", description: "Search-filter test: birthday event in Baguio.", category: EventCategory.birthday, targetCity: "Baguio", targetState: "Benguet", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-manila", name: "SF Art Exhibit Manila", description: "Search-filter test: other event in Manila.", category: EventCategory.other, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-wedding-cebu", name: "SF Beach Wedding Cebu", description: "Search-filter test: wedding event in Cebu City.", category: EventCategory.wedding, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-makati", name: "SF Rooftop Social Makati", description: "Search-filter test: social event in Makati.", category: EventCategory.social, targetCity: "Makati", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-corporate-makati", name: "SF Product Launch Makati", description: "Search-filter test: corporate event in Makati.", category: EventCategory.corporate, targetCity: "Makati", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-davao", name: "SF Debut Gala Davao", description: "Search-filter test: birthday event in Davao City.", category: EventCategory.birthday, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-clark", name: "SF Outdoor Concert Clark", description: "Search-filter test: social event in Clark.", category: EventCategory.social, targetCity: "Clark", targetState: "Pampanga", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-wedding-bagio", name: "SF Mountain Wedding Baguio", description: "Search-filter test: wedding event in Baguio.", category: EventCategory.wedding, targetCity: "Baguio", targetState: "Benguet", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-corporate-bagio", name: "SF Leadership Summit Baguio", description: "Search-filter test: corporate event in Baguio.", category: EventCategory.corporate, targetCity: "Baguio", targetState: "Benguet", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-cebu", name: "SF Food Festival Cebu", description: "Search-filter test: other event in Cebu City.", category: EventCategory.other, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-clark", name: "SF Fiesta Birthday Clark", description: "Search-filter test: birthday event in Clark.", category: EventCategory.birthday, targetCity: "Clark", targetState: "Pampanga", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-wedding-makati", name: "SF Garden Wedding Makati", description: "Search-filter test: wedding event in Makati.", category: EventCategory.wedding, targetCity: "Makati", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-davao", name: "SF Summer Social Davao", description: "Search-filter test: social event in Davao City.", category: EventCategory.social, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-bagio", name: "SF Cultural Night Baguio", description: "Search-filter test: other event in Baguio.", category: EventCategory.other, targetCity: "Baguio", targetState: "Benguet", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-corporate-clark", name: "SF Business Summit Clark", description: "Search-filter test: corporate event in Clark.", category: EventCategory.corporate, targetCity: "Clark", targetState: "Pampanga", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-wedding-davao-2", name: "SF Rustic Wedding Davao", description: "Search-filter test: wedding event in Davao City.", category: EventCategory.wedding, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-social-manila-2", name: "SF Reunion Night Manila", description: "Search-filter test: social event in Manila.", category: EventCategory.social, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-birthday-makati", name: "SF Sweet 16 Makati", description: "Search-filter test: birthday event in Makati.", category: EventCategory.birthday, targetCity: "Makati", targetState: "Metro Manila", isPublic: true, status: "published" as EventTemplateStatus },
      { id: "sf-template-other-davao", name: "SF Charity Gala Davao", description: "Search-filter test: other event in Davao City.", category: EventCategory.other, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "published" as EventTemplateStatus },

      // ── Should NOT appear (isPublic: false) ──────────────────────────────
      { id: "sf-template-social-private", name: "SF Private Social Manila", description: "Search-filter test: private template, should not appear.", category: EventCategory.social, targetCity: "Manila", targetState: "Metro Manila", isPublic: false, status: "published" as EventTemplateStatus },

      // ── Should NOT appear (non-published status) ─────────────────────────
      { id: "sf-template-wedding-draft", name: "SF Draft Wedding Manila", description: "Search-filter test: draft template, should not appear.", category: EventCategory.wedding, targetCity: "Manila", targetState: "Metro Manila", isPublic: true, status: "draft" as EventTemplateStatus },
      { id: "sf-template-corporate-rejected", name: "SF Rejected Corporate Cebu", description: "Search-filter test: rejected template, should not appear.", category: EventCategory.corporate, targetCity: "Cebu City", targetState: "Cebu", isPublic: true, status: "rejected" as EventTemplateStatus },
      { id: "sf-template-birthday-archived", name: "SF Archived Birthday Davao", description: "Search-filter test: archived template, should not appear.", category: EventCategory.birthday, targetCity: "Davao City", targetState: "Davao del Sur", isPublic: true, status: "archived" as EventTemplateStatus },
    ];

    for (const t of templates) {
      await prisma.eventTemplate.upsert({
        where: { id: t.id },
        update: { name: t.name, description: t.description, isPublic: t.isPublic, status: t.status },
        create: { ...t, ownerId: templateOwner.id, targetCountry: "Philippines" },
      });
    }
    console.log(`✓ Seeded ${templates.length} search-filter event templates`);

    // ── Template images ─────────────────────────────────────────────────────
    const TEMPLATE_COVERS: Record<EventCategory, string> = {
      [EventCategory.corporate]: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
      [EventCategory.birthday]:  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
      [EventCategory.wedding]:   "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop",
      [EventCategory.social]:    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop",
      [EventCategory.other]:     "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop",
    };

    for (const t of templates) {
      await prisma.file.upsert({
        where: { id: `sf-file-${t.id}` },
        update: { url: TEMPLATE_COVERS[t.category] },
        create: { id: `sf-file-${t.id}`, name: `${t.name} Cover`, type: "image/jpeg", url: TEMPLATE_COVERS[t.category], templateId: t.id },
      });
    }
    console.log("✓ Search-filter template images seeded");

    // ── 2. Assets (Gear Foxers) ─────────────────────────────────────────────
    // Pick foxers by city: gf-01=Makati, gf-02=Taguig, gf-03=Quezon City, gf-06=Cebu, gf-07=Manila
    const gf01 = users.find((u: any) => u.email === "gf-01@foxers.ph");
    const gf02 = users.find((u: any) => u.email === "gf-02@foxers.ph");
    const gf03 = users.find((u: any) => u.email === "gf-03@foxers.ph");
    const gf06 = users.find((u: any) => u.email === "gf-06@foxers.ph");
    const gf07 = users.find((u: any) => u.email === "gf-07@foxers.ph");
    const assetOwner = gf01 ?? users.find((u: any) => (u.email as string).startsWith("gf-"));
    if (!assetOwner) throw new Error("No gear foxer found for search-filter asset seeding");

    const assets = [
      // ── Available (should appear in search) ──────────────────────────────
      { id: "sf-asset-furnitures-manila-1", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.furnitures, name: "SF Banquet Chairs Set", description: "Search-filter test: furniture in Manila.", price: 25000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-cebu-1", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.sound_system, name: "SF PA System Cebu", description: "Search-filter test: sound system in Cebu City.", price: 30000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "new" as any },
      { id: "sf-asset-decorations-davao-1", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Floral Backdrop Davao", description: "Search-filter test: decorations in Davao City.", price: 18000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "good" as any },
      { id: "sf-asset-other-bagio-1", ownerId: assetOwner.id, category: AssetCategory.other, name: "SF Fog Machine Baguio", description: "Search-filter test: other asset in Baguio.", price: 12000, city: "Baguio", state: "Benguet", status: AssetStatus.available, billingRate: BillingRate.hourly, condition: "good" as any },
      { id: "sf-asset-furnitures-cebu-1", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.furnitures, name: "SF Cocktail Tables Cebu", description: "Search-filter test: furniture in Cebu City.", price: 15000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-manila-1", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.sound_system, name: "SF Wireless Mics Manila", description: "Search-filter test: sound system in Manila.", price: 10000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-decorations-manila-1", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.decorations, name: "SF LED Backdrop Manila", description: "Search-filter test: decorations in Manila.", price: 22000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "new" as any },
      { id: "sf-asset-furnitures-davao-1", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Lounge Set Davao", description: "Search-filter test: furniture in Davao City.", price: 40000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.weekly, condition: "good" as any },
      { id: "sf-asset-sound_system-davao-1", ownerId: assetOwner.id, category: AssetCategory.sound_system, name: "SF DJ Controller Davao", description: "Search-filter test: sound system in Davao City.", price: 35000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "new" as any },
      { id: "sf-asset-decorations-cebu-1", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.decorations, name: "SF Centerpiece Set Cebu", description: "Search-filter test: decorations in Cebu City.", price: 11000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.monthly, condition: "good" as any },
      { id: "sf-asset-other-davao-1", ownerId: assetOwner.id, category: AssetCategory.other, name: "SF Generator Davao", description: "Search-filter test: other asset in Davao City.", price: 52000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },

      // ── Extra available (for pagination testing) ─────────────────────────
      { id: "sf-asset-furnitures-makati-1", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Round Tables Makati", description: "Search-filter test: furniture in Makati.", price: 18000, city: "Makati", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-makati-1", ownerId: assetOwner.id, category: AssetCategory.sound_system, name: "SF Stage Speakers Makati", description: "Search-filter test: sound system in Makati.", price: 45000, city: "Makati", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "new" as any },
      { id: "sf-asset-decorations-makati-1", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Balloon Arch Makati", description: "Search-filter test: decorations in Makati.", price: 8000, city: "Makati", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "new" as any },
      { id: "sf-asset-furnitures-clark-1", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Long Tables Clark", description: "Search-filter test: furniture in Clark.", price: 20000, city: "Clark", state: "Pampanga", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-clark-1", ownerId: assetOwner.id, category: AssetCategory.sound_system, name: "SF Concert Speaker Clark", description: "Search-filter test: sound system in Clark.", price: 60000, city: "Clark", state: "Pampanga", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-decorations-clark-2", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Fairy Lights Clark", description: "Search-filter test: decorations in Clark.", price: 9500, city: "Clark", state: "Pampanga", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "good" as any },
      { id: "sf-asset-furnitures-bagio-2", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Wooden Benches Baguio", description: "Search-filter test: furniture in Baguio.", price: 14000, city: "Baguio", state: "Benguet", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-bagio-2", ownerId: assetOwner.id, category: AssetCategory.sound_system, name: "SF Acoustic Amp Baguio", description: "Search-filter test: sound system in Baguio.", price: 8500, city: "Baguio", state: "Benguet", status: AssetStatus.available, billingRate: BillingRate.hourly, condition: "good" as any },
      { id: "sf-asset-decorations-bagio-1", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Rustic Decor Set Baguio", description: "Search-filter test: decorations in Baguio.", price: 16000, city: "Baguio", state: "Benguet", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "good" as any },
      { id: "sf-asset-other-manila-2", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.other, name: "SF Portable Stage Manila", description: "Search-filter test: other asset in Manila.", price: 75000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-furnitures-cebu-2", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.furnitures, name: "SF Bamboo Chairs Cebu", description: "Search-filter test: furniture in Cebu City.", price: 12000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-decorations-cebu-2", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.decorations, name: "SF Tropical Floral Set Cebu", description: "Search-filter test: decorations in Cebu City.", price: 20000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "new" as any },
      { id: "sf-asset-sound_system-cebu-2", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.sound_system, name: "SF Karaoke System Cebu", description: "Search-filter test: sound system in Cebu City.", price: 9000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-other-cebu-1", ownerId: (gf06 ?? assetOwner).id, category: AssetCategory.other, name: "SF Tent Set Cebu", description: "Search-filter test: other asset in Cebu City.", price: 35000, city: "Cebu City", state: "Cebu", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-furnitures-davao-2", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Folding Chairs Davao", description: "Search-filter test: furniture in Davao City.", price: 10000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "fair" as any },
      { id: "sf-asset-decorations-davao-2", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Stage Drapes Davao", description: "Search-filter test: decorations in Davao City.", price: 28000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-sound_system-manila-2", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.sound_system, name: "SF Mini Mixer Manila", description: "Search-filter test: sound system in Manila.", price: 7500, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.hourly, condition: "good" as any },
      { id: "sf-asset-other-bagio-2", ownerId: assetOwner.id, category: AssetCategory.other, name: "SF Ice Sculpture Kit Baguio", description: "Search-filter test: other asset in Baguio.", price: 15000, city: "Baguio", state: "Benguet", status: AssetStatus.available, billingRate: BillingRate.one_time, condition: "good" as any },
      { id: "sf-asset-furnitures-manila-2", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.furnitures, name: "SF Chiavari Chairs Manila", description: "Search-filter test: furniture in Manila.", price: 30000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "new" as any },
      { id: "sf-asset-decorations-manila-2", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.decorations, name: "SF Marquee Light Set Manila", description: "Search-filter test: decorations in Manila.", price: 25000, city: "Manila", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-other-makati-1", ownerId: assetOwner.id, category: AssetCategory.other, name: "SF Photo Booth Makati", description: "Search-filter test: other asset in Makati.", price: 18000, city: "Makati", state: "Metro Manila", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "new" as any },
      { id: "sf-asset-other-davao-2", ownerId: assetOwner.id, category: AssetCategory.other, name: "SF Crowd Barrier Davao", description: "Search-filter test: other asset in Davao City.", price: 22000, city: "Davao City", state: "Davao del Sur", status: AssetStatus.available, billingRate: BillingRate.daily, condition: "good" as any },

      // ── Should NOT appear (non-available status) ─────────────────────────
      { id: "sf-asset-sound_system-bagio-1", ownerId: assetOwner.id, category: AssetCategory.sound_system, name: "SF Pending Mixer Baguio", description: "Search-filter test: pending asset, should not appear.", price: 15000, city: "Baguio", state: "Benguet", status: AssetStatus.pending, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-decorations-clark-1", ownerId: assetOwner.id, category: AssetCategory.decorations, name: "SF Archived Decor Clark", description: "Search-filter test: archived asset, should not appear.", price: 12000, city: "Clark", state: "Pampanga", status: AssetStatus.archived, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-other-manila-1", ownerId: (gf07 ?? assetOwner).id, category: AssetCategory.other, name: "SF Rejected Stanchions Manila", description: "Search-filter test: rejected asset, should not appear.", price: 14000, city: "Manila", state: "Metro Manila", status: AssetStatus.rejected, billingRate: BillingRate.daily, condition: "good" as any },
      { id: "sf-asset-furnitures-bagio-1", ownerId: assetOwner.id, category: AssetCategory.furnitures, name: "SF Draft Tables Baguio", description: "Search-filter test: draft asset, should not appear.", price: 16000, city: "Baguio", state: "Benguet", status: AssetStatus.draft, billingRate: BillingRate.daily, condition: "fair" as any },
    ];

    for (const a of assets) {
      await prisma.asset.upsert({
        where: { id: a.id },
        update: { name: a.name, description: a.description, price: a.price, status: a.status },
        create: { ...a, quantity: 1, currency: "PHP", country: "Philippines" },
      });
    }
    console.log(`✓ Seeded ${assets.length} search-filter assets`);

    // ── Asset images ────────────────────────────────────────────────────────
    const ASSET_COVERS: Record<AssetCategory, string> = {
      [AssetCategory.furnitures]:  "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop",
      [AssetCategory.sound_system]: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&auto=format&fit=crop",
      [AssetCategory.decorations]: "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=800&auto=format&fit=crop",
      [AssetCategory.other]:       "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
    };

    for (const a of assets) {
      await prisma.file.upsert({
        where: { id: `sf-file-${a.id}` },
        update: { url: ASSET_COVERS[a.category] },
        create: { id: `sf-file-${a.id}`, name: `${a.name} Cover`, type: "image/jpeg", url: ASSET_COVERS[a.category], assetId: a.id },
      });
    }
    console.log("✓ Search-filter asset images seeded");

    // ── 3. Services (Service Foxers) ────────────────────────────────────────
    // Pick foxers: sf-01=Makati, sf-02=Taguig, sf-03=Quezon City, sf-06=Cebu
    const sf01 = users.find((u: any) => u.email === "sf-01@foxers.ph");
    const sf02 = users.find((u: any) => u.email === "sf-02@foxers.ph");
    const sf03 = users.find((u: any) => u.email === "sf-03@foxers.ph");
    const sf06 = users.find((u: any) => u.email === "sf-06@foxers.ph");
    const svcOwner = sf01 ?? users.find((u: any) => (u.email as string).startsWith("sf-"));
    if (!svcOwner) throw new Error("No service foxer found for search-filter service seeding");

    const services = [
      // ── Available (should appear in search) ──────────────────────────────
      { id: "sf-service-catering-manila-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.catering, name: "SF Premium Catering Manila", description: "Search-filter test: catering in Manila.", price: 800, city: "Manila", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["catering", "buffet", "manila"] },
      { id: "sf-service-entertainment-cebu-1", ownerId: (sf06 ?? svcOwner).id, category: ServiceCategory.entertainment, name: "SF Live Band Cebu", description: "Search-filter test: entertainment in Cebu City.", price: 25000, city: "Cebu City", state: "Cebu", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["band", "live music", "cebu"] },
      { id: "sf-service-design-davao-1", ownerId: svcOwner.id, category: ServiceCategory.design, name: "SF Event Styling Davao", description: "Search-filter test: design in Davao City.", price: 18000, city: "Davao City", state: "Davao del Sur", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["design", "styling", "davao"] },
      { id: "sf-service-service_staff-bagio-1", ownerId: svcOwner.id, category: ServiceCategory.service_staff, name: "SF Waitstaff Team Baguio", description: "Search-filter test: service staff in Baguio.", price: 600, city: "Baguio", state: "Benguet", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["staff", "waiters", "baguio"] },
      { id: "sf-service-other-clark-1", ownerId: svcOwner.id, category: ServiceCategory.other, name: "SF Event Coordination Clark", description: "Search-filter test: other service in Clark.", price: 15000, city: "Clark", state: "Pampanga", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["coordination", "planning", "clark"] },
      { id: "sf-service-catering-cebu-1", ownerId: (sf06 ?? svcOwner).id, category: ServiceCategory.catering, name: "SF Sushi Bar Cebu", description: "Search-filter test: catering in Cebu City.", price: 12000, city: "Cebu City", state: "Cebu", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["sushi", "japanese", "cebu"] },
      { id: "sf-service-entertainment-manila-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.entertainment, name: "SF DJ Set Manila", description: "Search-filter test: entertainment in Manila.", price: 20000, city: "Manila", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["DJ", "mixing", "manila"] },
      { id: "sf-service-design-manila-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.design, name: "SF Floral Design Manila", description: "Search-filter test: design in Manila.", price: 15000, city: "Manila", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["floral", "arrangement", "manila"] },
      { id: "sf-service-other-cebu-1", ownerId: (sf06 ?? svcOwner).id, category: ServiceCategory.other, name: "SF Drone Coverage Cebu", description: "Search-filter test: other service in Cebu City.", price: 22000, city: "Cebu City", state: "Cebu", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["drone", "aerial", "cebu"] },

      // ── Extra available (for pagination testing) ─────────────────────────
      { id: "sf-service-catering-makati-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.catering, name: "SF Fine Dining Catering Makati", description: "Search-filter test: catering in Makati.", price: 1500, city: "Makati", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["catering", "fine dining", "makati"] },
      { id: "sf-service-entertainment-makati-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.entertainment, name: "SF Jazz Band Makati", description: "Search-filter test: entertainment in Makati.", price: 30000, city: "Makati", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["jazz", "band", "makati"] },
      { id: "sf-service-design-makati-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.design, name: "SF Minimalist Styling Makati", description: "Search-filter test: design in Makati.", price: 20000, city: "Makati", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["minimalist", "styling", "makati"] },
      { id: "sf-service-catering-davao-1", ownerId: svcOwner.id, category: ServiceCategory.catering, name: "SF Filipino Feast Davao", description: "Search-filter test: catering in Davao City.", price: 650, city: "Davao City", state: "Davao del Sur", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["catering", "filipino", "davao"] },
      { id: "sf-service-entertainment-davao-1", ownerId: svcOwner.id, category: ServiceCategory.entertainment, name: "SF Acoustic Duo Davao", description: "Search-filter test: entertainment in Davao City.", price: 12000, city: "Davao City", state: "Davao del Sur", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["acoustic", "duo", "davao"] },
      { id: "sf-service-design-bagio-1", ownerId: svcOwner.id, category: ServiceCategory.design, name: "SF Rustic Theme Design Baguio", description: "Search-filter test: design in Baguio.", price: 14000, city: "Baguio", state: "Benguet", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["rustic", "theme", "baguio"] },
      { id: "sf-service-service_staff-manila-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.service_staff, name: "SF Bartender Team Manila", description: "Search-filter test: service staff in Manila.", price: 900, city: "Manila", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["bartender", "bar", "manila"] },
      { id: "sf-service-service_staff-cebu-1", ownerId: (sf06 ?? svcOwner).id, category: ServiceCategory.service_staff, name: "SF Usher Team Cebu", description: "Search-filter test: service staff in Cebu City.", price: 550, city: "Cebu City", state: "Cebu", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: false, tags: ["usher", "staff", "cebu"] },
      { id: "sf-service-other-makati-1", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.other, name: "SF Full-Service Event Planning Makati", description: "Search-filter test: other service in Makati.", price: 50000, city: "Makati", state: "Metro Manila", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["planning", "full-service", "makati"] },
      { id: "sf-service-catering-bagio-1", ownerId: svcOwner.id, category: ServiceCategory.catering, name: "SF Mountain Cuisine Baguio", description: "Search-filter test: catering in Baguio.", price: 750, city: "Baguio", state: "Benguet", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: false, tags: ["cuisine", "mountain", "baguio"] },
      { id: "sf-service-entertainment-clark-1", ownerId: svcOwner.id, category: ServiceCategory.entertainment, name: "SF Rock Band Clark", description: "Search-filter test: entertainment in Clark.", price: 28000, city: "Clark", state: "Pampanga", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["rock", "band", "clark"] },
      { id: "sf-service-service_staff-davao-1", ownerId: svcOwner.id, category: ServiceCategory.service_staff, name: "SF Waitstaff Team Davao", description: "Search-filter test: service staff in Davao City.", price: 600, city: "Davao City", state: "Davao del Sur", status: ServiceStatus.available, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["waitstaff", "staff", "davao"] },
      { id: "sf-service-design-clark-1", ownerId: svcOwner.id, category: ServiceCategory.design, name: "SF Grand Stage Design Clark", description: "Search-filter test: design in Clark.", price: 35000, city: "Clark", state: "Pampanga", status: ServiceStatus.available, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["stage", "design", "clark"] },

      // ── Should NOT appear (non-available status) ─────────────────────────
      { id: "sf-service-catering-davao-2", ownerId: svcOwner.id, category: ServiceCategory.catering, name: "SF Paused Catering Davao", description: "Search-filter test: paused service, should not appear.", price: 900, city: "Davao City", state: "Davao del Sur", status: ServiceStatus.paused, billingRate: BillingRate.daily, isWillingToTravel: true, tags: ["catering", "davao"] },
      { id: "sf-service-entertainment-bagio-1", ownerId: svcOwner.id, category: ServiceCategory.entertainment, name: "SF Archived Band Baguio", description: "Search-filter test: archived service, should not appear.", price: 20000, city: "Baguio", state: "Benguet", status: ServiceStatus.archived, billingRate: BillingRate.one_time, isWillingToTravel: false, tags: ["band", "baguio"] },
      { id: "sf-service-design-clark-2", ownerId: svcOwner.id, category: ServiceCategory.design, name: "SF Rejected Styling Clark", description: "Search-filter test: rejected service, should not appear.", price: 16000, city: "Clark", state: "Pampanga", status: ServiceStatus.rejected, billingRate: BillingRate.one_time, isWillingToTravel: true, tags: ["design", "clark"] },
      { id: "sf-service-service_staff-manila-2", ownerId: (sf01 ?? svcOwner).id, category: ServiceCategory.service_staff, name: "SF Draft Staffing Manila", description: "Search-filter test: draft service, should not appear.", price: 700, city: "Manila", state: "Metro Manila", status: ServiceStatus.draft, billingRate: BillingRate.daily, isWillingToTravel: false, tags: ["staff", "manila"] },
    ];

    for (const s of services) {
      await prisma.service.upsert({
        where: { id: s.id },
        update: { name: s.name, description: s.description, price: s.price, status: s.status, tags: s.tags },
        create: { ...s, currency: "PHP", country: "Philippines" },
      });
    }
    console.log(`✓ Seeded ${services.length} search-filter services`);

    // ── Service images ──────────────────────────────────────────────────────
    const SVC_COVERS: Record<ServiceCategory, string> = {
      [ServiceCategory.catering]:      "https://images.unsplash.com/photo-1555244162-803834f70033?w=800&auto=format&fit=crop",
      [ServiceCategory.entertainment]: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop",
      [ServiceCategory.design]:        "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop",
      [ServiceCategory.service_staff]: "https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800&auto=format&fit=crop",
      [ServiceCategory.other]:         "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop",
    };

    for (const s of services) {
      await prisma.file.upsert({
        where: { id: `sf-file-${s.id}` },
        update: { url: SVC_COVERS[s.category] },
        create: { id: `sf-file-${s.id}`, name: `${s.name} Cover`, type: "image/jpeg", url: SVC_COVERS[s.category], serviceId: s.id },
      });
    }
    console.log("✓ Search-filter service images seeded");

    console.log("✅ Search-filter seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding search filters:", error);
    throw error;
  }
}

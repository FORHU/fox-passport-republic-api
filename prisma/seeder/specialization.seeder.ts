import { PrismaClient, RoleType } from "@prisma/client";

export async function seedSpecializations(prisma: PrismaClient, users: any[]) {
  console.log("Starting specialization seed...");

  const host        = users.find(u => u.email === "host@example.com");
  const serviceFoxer = users.find(u => u.email === "servicefoxer@example.com");
  const gearFoxer   = users.find(u => u.email === "gearfoxer@example.com");
  const mayor       = users.find(u => u.email === "mayor@example.com");
  const multi       = users.find(u => u.email === "multirole@example.com");
  const jasmine     = users.find(u => u.email === "jasmine.reyes@foxers.ph");
  const marco       = users.find(u => u.email === "marco.santos@foxers.ph");
  const sarah       = users.find(u => u.email === "sarah.lim@foxers.ph");

  const rows: {
    userId: string;
    roleType: RoleType;
    category: string;
    source: "declared" | "earned";
  }[] = [];

  if (host) {
    rows.push(
      { userId: host.id, roleType: "eventFoxer", category: "birthday",  source: "earned"   },
      { userId: host.id, roleType: "eventFoxer", category: "corporate", source: "declared" },
    );
  }

  if (serviceFoxer) {
    rows.push(
      { userId: serviceFoxer.id, roleType: "serviceFoxer", category: "entertainment", source: "declared" },
      { userId: serviceFoxer.id, roleType: "serviceFoxer", category: "catering",      source: "earned"   },
    );
  }

  if (gearFoxer) {
    rows.push(
      { userId: gearFoxer.id, roleType: "gearFoxer", category: "sound_system", source: "earned"   },
      { userId: gearFoxer.id, roleType: "gearFoxer", category: "decorations",  source: "declared" },
    );
  }

  if (mayor) {
    rows.push(
      { userId: mayor.id, roleType: "venueFoxer", category: "indoor",   source: "declared" },
      { userId: mayor.id, roleType: "venueFoxer", category: "outdoor",  source: "earned"   },
    );
  }

  if (multi) {
    rows.push(
      { userId: multi.id, roleType: "eventFoxer",  category: "social",   source: "declared" },
      { userId: multi.id, roleType: "serviceFoxer", category: "design",  source: "declared" },
      { userId: multi.id, roleType: "venueFoxer",  category: "indoor",  source: "earned"   },
    );
  }

  if (jasmine) {
    rows.push(
      { userId: jasmine.id, roleType: "serviceFoxer", category: "entertainment", source: "declared" },
      { userId: jasmine.id, roleType: "serviceFoxer", category: "design",        source: "earned"   },
    );
  }

  if (marco) {
    rows.push(
      { userId: marco.id, roleType: "serviceFoxer", category: "catering", source: "earned" },
    );
  }

  if (sarah) {
    rows.push(
      { userId: sarah.id, roleType: "serviceFoxer", category: "service_staff", source: "declared" },
      { userId: sarah.id, roleType: "serviceFoxer", category: "entertainment",  source: "earned"   },
    );
  }

  // ── Bulk foxer specializations for pagination testing ────────────────────
  const EF_CATEGORIES = ["birthday", "wedding", "corporate", "social", "other"];
  const GF_CATEGORIES = ["sound_system", "decorations", "furnitures", "other"];
  const SF_CATEGORIES = ["entertainment", "catering", "design", "service_staff", "other"];

  for (let i = 1; i <= 16; i++) {
    const foxer = users.find((u: any) => u.email === `ef-${String(i).padStart(2, "0")}@foxers.ph`);
    if (foxer) {
      rows.push(
        { userId: foxer.id, roleType: "eventFoxer", category: EF_CATEGORIES[i % EF_CATEGORIES.length], source: i % 2 === 0 ? "earned" : "declared" },
        { userId: foxer.id, roleType: "eventFoxer", category: EF_CATEGORIES[(i + 2) % EF_CATEGORIES.length], source: "declared" },
      );
    }
  }

  for (let i = 1; i <= 29; i++) {
    const foxer = users.find((u: any) => u.email === `gf-${String(i).padStart(2, "0")}@foxers.ph`);
    if (foxer) {
      rows.push(
        { userId: foxer.id, roleType: "gearFoxer", category: GF_CATEGORIES[i % GF_CATEGORIES.length], source: i % 3 === 0 ? "earned" : "declared" },
        { userId: foxer.id, roleType: "gearFoxer", category: GF_CATEGORIES[(i + 1) % GF_CATEGORIES.length], source: "earned" },
      );
    }
  }

  for (let i = 1; i <= 16; i++) {
    const foxer = users.find((u: any) => u.email === `sf-${String(i).padStart(2, "0")}@foxers.ph`);
    if (foxer) {
      rows.push(
        { userId: foxer.id, roleType: "serviceFoxer", category: SF_CATEGORIES[i % SF_CATEGORIES.length], source: i % 2 === 0 ? "earned" : "declared" },
        { userId: foxer.id, roleType: "serviceFoxer", category: SF_CATEGORIES[(i + 1) % SF_CATEGORIES.length], source: "declared" },
      );
    }
  }

  for (const row of rows) {
    await prisma.foxerSpecialization.upsert({
      where: { userId_roleType_category: { userId: row.userId, roleType: row.roleType, category: row.category } },
      update: { source: row.source },
      create: row,
    });
    console.log(`  ✓ [${row.source}] ${row.roleType} / ${row.category} → ${row.userId.slice(0, 8)}…`);
  }

  console.log("✅ Specialization seeding completed!");
}

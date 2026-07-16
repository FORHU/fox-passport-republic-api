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

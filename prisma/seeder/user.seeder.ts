import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/utils/password";

// ── Name pools for bulk foxer generation ─────────────────────────────────────
const FIRST_NAMES = [
  "Ana",
  "Bea",
  "Carlos",
  "Diana",
  "Enrique",
  "Faith",
  "Gabriel",
  "Hannah",
  "Ivan",
  "Joy",
  "Kevin",
  "Liza",
  "Miguel",
  "Nina",
  "Oscar",
  "Patricia",
  "Rafael",
  "Sofia",
  "Tristan",
  "Uma",
  "Victor",
  "Wendy",
  "Xavier",
  "Ysa",
  "Zeke",
  "Alyssa",
  "Bryan",
  "Carla",
  "Derek",
  "Elena",
];

const LAST_NAMES = [
  "Reyes",
  "Santos",
  "Cruz",
  "Garcia",
  "Mendoza",
  "Torres",
  "Ramos",
  "Flores",
  "Dela Cruz",
  "Villanueva",
  "Bautista",
  "Aquino",
  "Fernandez",
  "Lopez",
  "Castillo",
  "Rivera",
  "Gonzales",
  "Hernandez",
  "Soriano",
  "Dizon",
  "Pascual",
  "Tan",
  "Lim",
  "Ong",
  "Chua",
  "Aguilar",
  "Mercado",
  "Navarro",
  "Perez",
  "Rosales",
];

const CITIES: { city: string; state: string }[] = [
  { city: "Manila", state: "Metro Manila" },
  { city: "Makati", state: "Metro Manila" },
  { city: "Taguig", state: "Metro Manila" },
  { city: "Quezon City", state: "Metro Manila" },
  { city: "Pasig", state: "Metro Manila" },
  { city: "Cebu City", state: "Cebu" },
  { city: "Davao City", state: "Davao del Sur" },
];

const SEED_PASSWORD = "Password123!";

function generateBulkFoxers(prefix: string, roleType: string[], count: number) {
  return Array.from({ length: count }, (_, i) => {
    const idx = i + 1;
    const loc = CITIES[idx % CITIES.length];
    const first = FIRST_NAMES[idx % FIRST_NAMES.length];
    const last = LAST_NAMES[idx % LAST_NAMES.length];
    return {
      email: `${prefix}-${String(idx).padStart(2, "0")}@foxers.ph`,
      password: SEED_PASSWORD,
      name: `${first} ${last}`,
      username: `${prefix}_${String(idx).padStart(2, "0")}`,
      systemRole: "user",
      roleType,
      city: loc.city,
      state: loc.state,
      country: "Philippines",
    };
  });
}

export async function seedUsers(prisma: PrismaClient) {
  try {
    console.log("Starting user seed...");

    const users = [
      {
        email: "admin@example.com",
        password: SEED_PASSWORD,
        name: "Admin User",
        username: "admin",
        systemRole: "admin",
        roleType: [],
      },
      {
        email: "secretary@example.com",
        password: SEED_PASSWORD,
        name: "Queue Secretary",
        username: "secretary",
        systemRole: "admin_secretary",
        roleType: [],
      },
      {
        email: "mayor@example.com",
        password: SEED_PASSWORD,
        name: "Mayor Santos",
        username: "mayor_santos",
        systemRole: "user",
        roleType: ["venueFoxer"],
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "host@example.com",
        password: SEED_PASSWORD,
        name: "Host Reyes",
        username: "host_reyes",
        systemRole: "user",
        roleType: ["eventFoxer"],
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "servicefoxer@example.com",
        password: SEED_PASSWORD,
        name: "Service Foxer Cruz",
        username: "foxer_service",
        systemRole: "user",
        roleType: ["serviceFoxer"],
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "gearfoxer@example.com",
        password: SEED_PASSWORD,
        name: "Gear Foxer Dela Rosa",
        username: "foxer_gear",
        systemRole: "user",
        roleType: ["gearFoxer"],
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "multirole@example.com",
        password: SEED_PASSWORD,
        name: "Multi Role Villanueva",
        username: "multirole",
        systemRole: "user",
        roleType: ["eventFoxer", "venueFoxer", "serviceFoxer"],
        city: "Pasig",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "user@example.com",
        password: SEED_PASSWORD,
        name: "Regular User",
        username: "regular",
        systemRole: "user",
        roleType: [],
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
      // ── Foxer Personas (replacing hardcoded data/foxers.ts) ───────────────
      {
        email: "jasmine.reyes@foxers.ph",
        password: SEED_PASSWORD,
        name: "Jasmine Reyes",
        username: "jasmine_reyes",
        systemRole: "user",
        roleType: ["serviceFoxer"],
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "marco.santos@foxers.ph",
        password: SEED_PASSWORD,
        name: "Marco Santos",
        username: "marco_santos",
        systemRole: "user",
        roleType: ["serviceFoxer"],
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "sarah.lim@foxers.ph",
        password: SEED_PASSWORD,
        name: "Sarah Lim",
        username: "sarah_lim",
        systemRole: "user",
        roleType: ["serviceFoxer"],
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
      },
      // ── Bulk foxers for search/pagination testing ─────────────────────────
      ...generateBulkFoxers("ef", ["eventFoxer"], 16),
      ...generateBulkFoxers("gf", ["gearFoxer"], 60),
      ...generateBulkFoxers("sf", ["serviceFoxer"], 60),
    ];

    const seededUsers = [];

    for (const u of users) {
      const hashed = await hashPassword(u.password);

      const created = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          username: u.username,
          password: hashed,
          systemRole: u.systemRole as any,
          roleType: u.roleType as any,
          city: (u as any).city,
          state: (u as any).state,
          country: (u as any).country,
        },
        create: {
          email: u.email,
          password: hashed,
          name: u.name,
          username: u.username,
          systemRole: u.systemRole as any,
          roleType: u.roleType as any,
          city: (u as any).city,
          state: (u as any).state,
          country: (u as any).country,
        },
      });

      console.log(
        `✓ ${created.email} — roles: [${u.roleType.join(", ") || u.systemRole}]`,
      );
      seededUsers.push(created);
    }

    console.log("✅ User seeding completed successfully!");
    return seededUsers;
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    throw error;
  }
}

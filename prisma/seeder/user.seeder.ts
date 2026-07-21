import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// ── Name pools for bulk foxer generation ─────────────────────────────────────
const FIRST_NAMES = [
  "Ana", "Bea", "Carlos", "Diana", "Enrique", "Faith", "Gabriel", "Hannah",
  "Ivan", "Joy", "Kevin", "Liza", "Miguel", "Nina", "Oscar", "Patricia",
  "Rafael", "Sofia", "Tristan", "Uma", "Victor", "Wendy", "Xavier", "Ysa",
  "Zeke", "Alyssa", "Bryan", "Carla", "Derek", "Elena",
];

const LAST_NAMES = [
  "Reyes", "Santos", "Cruz", "Garcia", "Mendoza", "Torres", "Ramos", "Flores",
  "Dela Cruz", "Villanueva", "Bautista", "Aquino", "Fernandez", "Lopez", "Castillo",
  "Rivera", "Gonzales", "Hernandez", "Soriano", "Dizon", "Pascual", "Tan",
  "Lim", "Ong", "Chua", "Aguilar", "Mercado", "Navarro", "Perez", "Rosales",
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

function generateBulkFoxers(
  prefix: string,
  roleType: string[],
  count: number
) {
  return Array.from({ length: count }, (_, i) => {
    const idx = i + 1;
    const loc = CITIES[idx % CITIES.length];
    const first = FIRST_NAMES[idx % FIRST_NAMES.length];
    const last = LAST_NAMES[idx % LAST_NAMES.length];
    return {
      email: `${prefix}-${String(idx).padStart(2, "0")}@foxers.ph`,
      password: "SeedFoxer1234567890!",
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
        password: "Adminjun1234567890!",
        name: "Admin User",
        username: "admin",
        systemRole: "admin",
        roleType: [],
      },
      {
        email: "mayor@example.com",
        password: "Mayormamamo1234567890!",
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
        password: "Hostpangani1234567890!",
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
        password: "Service1234567890!",
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
        password: "GearFoxer1234567890!",
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
        password: "Multijungkwan1234567890!",
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
        password: "Usernanaymo@1234567890!",
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
        password: "Foxerkupals1234567890!",
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
        password: "Foxerkupalska@123456789!",
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
        password: "Foxerkupalskanga1234567890@!",
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
      ...generateBulkFoxers("gf", ["gearFoxer"], 29),
      ...generateBulkFoxers("sf", ["serviceFoxer"], 16),
    ];


    const seededUsers = [];

    for (const u of users) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.pbkdf2Sync(u.password, salt, 1000, 64, "sha512").toString("hex");
      const hashed = `${salt}:${hash}`;

      const created = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          username: u.username,
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

      console.log(`✓ ${created.email} — roles: [${u.roleType.join(", ") || u.systemRole}]`);
      seededUsers.push(created);
    }

    console.log("✅ User seeding completed successfully!");
    return seededUsers;
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    throw error;
  }
}

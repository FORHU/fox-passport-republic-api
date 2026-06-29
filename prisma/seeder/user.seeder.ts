import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

export async function seedUsers(prisma: PrismaClient) {
  try {
    console.log("Starting user seed...");

    const users = [
      {
        email: "admin@example.com",
        password: "Admin1234567890!",
        name: "Admin User",
        username: "admin",
        systemRole: "admin",
        roleType: [],
      },
      {
        email: "mayor@example.com",
        password: "Mayor1234567890!",
        name: "Mayor Santos",
        username: "mayor_santos",
        systemRole: "user",
        roleType: ["mayor"],
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "host@example.com",
        password: "Host1234567890!",
        name: "Host Reyes",
        username: "host_reyes",
        systemRole: "user",
        roleType: ["host"],
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
        roleType: ["foxerService"],
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
        roleType: ["foxerAsset"],
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "multirole@example.com",
        password: "Multi1234567890!",
        name: "Multi Role Villanueva",
        username: "multirole",
        systemRole: "user",
        roleType: ["host", "mayor", "foxerService"],
        city: "Pasig",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "user@example.com",
        password: "User@1234567890!",
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
        password: "Foxer1234567890!",
        name: "Jasmine Reyes",
        username: "jasmine_reyes",
        systemRole: "user",
        roleType: ["foxerService"],
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "marco.santos@foxers.ph",
        password: "Foxer@123456789!",
        name: "Marco Santos",
        username: "marco_santos",
        systemRole: "user",
        roleType: ["foxerService"],
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        email: "sarah.lim@foxers.ph",
        password: "Foxer1234567890@!",
        name: "Sarah Lim",
        username: "sarah_lim",
        systemRole: "user",
        roleType: ["foxerService"],
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
      },
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

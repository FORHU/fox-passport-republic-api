import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

export async function seedUsers(prisma: PrismaClient) {
  try {
    console.log("Starting user seed...");

    const users = [
      {
        email: "admin@example.com",
        password: "Admin123!",
        name: "Admin User",
        username: "admin",
        systemRole: "admin",
        roleType: ["host", "mayor", "foxerAsset", "foxerService"],
      },
      {
        email: "host@example.com",
        password: "Host123!",
        name: "Host User",
        username: "testhost",
        systemRole: "user",
        roleType: ["mayor"],
      },
      {
        email: "user@example.com",
        password: "User123!",
        name: "Regular User",
        username: "regular",
        systemRole: "user",
        roleType: [],
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
          password: hashed,
          name: u.name,
          username: u.username,
          systemRole: u.systemRole as any,
          roleType: u.roleType as any,
        },
        create: {
          email: u.email,
          password: hashed,
          name: u.name,
          username: u.username,
          systemRole: u.systemRole as any,
          roleType: u.roleType as any,
        },
      });

      console.log(`✓ Created/Updated user: ${created.email} (${created.id})`);
      seededUsers.push(created);
    }

    console.log("✅ User seeding completed successfully!");
    return seededUsers;
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    throw error;
  }
}

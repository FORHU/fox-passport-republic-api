import { prisma } from "./src/utils/prisma";
import bcrypt from "bcrypt";

async function seedUsers() {
  try {
    console.log("Starting user seed...");

    const users = [
      {
        email: "admin@example.com",
        password: "Admin123!",
        name: "Admin User",
        username: "admin",
        systemRole: "admin",
        roleType: [],
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

    for (const u of users) {
      const hashed = await bcrypt.hash(u.password, 10);

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
    }

    console.log("\n✅ User seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding users:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedUsers();

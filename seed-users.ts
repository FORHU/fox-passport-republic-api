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
        role: "admin",
        isVerified: true,
        isHost: false,
        isFoxer: false,
      },
      {
        email: "host@example.com",
        password: "Host123!",
        name: "Host User",
        username: "testhost",
        role: "user",
        isVerified: true,
        isHost: true,
        isFoxer: false,
      },
      {
        email: "user@example.com",
        password: "User123!",
        name: "Regular User",
        username: "regular",
        role: "user",
        isVerified: false,
        isHost: false,
        isFoxer: false,
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
          role: u.role as any,
          isVerified: u.isVerified,
          isHost: u.isHost,
          isFoxer: u.isFoxer,
        },
        create: {
          email: u.email,
          password: hashed,
          name: u.name,
          username: u.username,
          role: u.role as any,
          isVerified: u.isVerified,
          isHost: u.isHost,
          isFoxer: u.isFoxer,
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

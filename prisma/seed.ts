import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import "dotenv/config"


import { seedUsers } from "./seeders/users.seeder"
import { seedPassport } from "./seeders/passport.seeder"
import { seedAsset } from "./seeders/asset.seeder"
import { seedService } from "./seeders/service.seeder"
import { seedVenue } from "./seeders/venue.seeder"
import { seedPayment } from "./seeders/payment.seeder"
import { seedFavorite } from "./seeders/favorite.seeder"
import { seedReviews } from "./seeders/review.seeder"

const connectionString = `${process.env.DATABASE_URL}`

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🚀 Starting database seeding...")
  await seedUsers(prisma)
  await seedPassport(prisma)
  await seedAsset(prisma)
  await seedService(prisma)
  await seedVenue(prisma)
  await seedPayment(prisma)
  await seedFavorite(prisma)
  await seedReviews(prisma)
  console.log("✅ Seeding completed successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import "dotenv/config"


import { seedUsers } from "./seeders/users.seeder"
import { seedCategories } from "./seeders/categories.seeder"
import { seedVenue } from "./seeders/venue.seeder"
import { seedAsset } from "./seeders/asset.seeder"
import { seedService } from "./seeders/service.seeder"
import { seedEvent } from "./seeders/event.seeder"
import { seedBooking } from "./seeders/booking.seeder"
import { seedPassport } from "./seeders/passport.seeder"
import { seedFavorite } from "./seeders/favorite.seeder"
import { seedReviews } from "./seeders/review.seeder"
import { seedPayment } from "./seeders/payment.seeder"

const connectionString = `${process.env.DATABASE_URL}`

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
//await only for all seeders

async function main() {
  console.log("Seeding database...")

  await seedUsers(prisma)
  await seedCategories(prisma)

  await seedVenue(prisma)
  await seedAsset(prisma)
  await seedService(prisma)

  await seedEvent(prisma)

  await seedBooking(prisma)

  await seedPassport(prisma)

  await seedFavorite(prisma)

  await seedReviews(prisma)

  await seedPayment(prisma)

  console.log("Seeding completed")

}

main()
  .catch((e) => {
    console.error("Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

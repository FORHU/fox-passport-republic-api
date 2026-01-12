import {
  PrismaClient,
  UserRole,
  ListingStatus,
  ListingType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  // 1. Clean the database
  // Order matters because of foreign keys
  await prisma.listingFoxerService.deleteMany();
  await prisma.foxerProfile.deleteMany();
  await prisma.eventCategory.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.review.deleteMany();
  await prisma.bookingAttendee.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listingPricing.deleteMany();
  await prisma.listingLocation.deleteMany();
  await prisma.listingAmenity.deleteMany();
  await prisma.listingAvailability.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash("password123", 10);

  // 2. Create Users
  const hostUser = await prisma.user.create({
    data: {
      email: "host@example.com",
      password: hashedPassword,
      name: "John Host",
      username: "johnhost",
      role: UserRole.host,
      isHost: true,
      isVerified: true,
    },
  });

  const foxerUser = await prisma.user.create({
    data: {
      email: "foxer@example.com",
      password: hashedPassword,
      name: "Sarah Foxer",
      username: "sarahfoxer",
      role: UserRole.host, // Foxers are hosts too
      isHost: true,
      isFoxer: true,
      isVerified: true,
    },
  });

  const guestUser = await prisma.user.create({
    data: {
      email: "guest@example.com",
      password: hashedPassword,
      name: "Bob Guest",
      username: "bobguest",
      role: UserRole.user,
      isVerified: true,
    },
  });

  // 3. Create Categories
  const weddingCat = await prisma.category.create({
    data: {
      name: "Wedding",
      slug: "wedding",
      description: "Everything you need for a perfect wedding",
    },
  });

  const beachWeddingCat = await prisma.category.create({
    data: {
      name: "Beach Wedding",
      slug: "beach-wedding",
      description: "Specialized services and venues for seaside nuptials",
      parentCategoryId: weddingCat.id,
    },
  });

  const eventCat = await prisma.eventCategory.create({
    data: {
      name: "Event Planning",
      slug: "event-planning",
    },
  });

  // 4. Create Foxer Profile
  const foxerProfile = await prisma.foxerProfile.create({
    data: {
      userId: foxerUser.id,
      bio: "Professional wedding and event planner with 10 years of experience.",
      skills: "Planning, Decoration, Catering Coordination",
      isAvailable: true,
    },
  });

  // 5. Create Listings

  // A. Venue
  const venue = await prisma.listing.create({
    data: {
      hostId: hostUser.id,
      categoryId: weddingCat.id,
      title: "Grand Emerald Ballroom",
      description:
        "A luxurious ballroom perfect for high-end weddings and corporate events. Features crystal chandeliers and a marble dance floor.",
      type: ListingType.venue,
      status: ListingStatus.published,
      capacity: 500,
      location: {
        create: {
          streetAddress: "456 Luxury Lane",
          city: "Manila",
          country: "Philippines",
          state: "NCR",
        },
      },
      pricing: {
        create: {
          basePrice: 2500,
          currency: "USD",
          serviceFeePercent: 10,
          taxPercent: 12,
        },
      },
    },
  });

  // B. Equipment (Chairs)
  const equipment = await prisma.listing.create({
    data: {
      hostId: hostUser.id,
      categoryId: weddingCat.id,
      title: "Crystal Tiffany Chairs",
      description:
        "Transparent premium tiffany chairs that add a touch of modern elegance to any setup.",
      type: ListingType.equipment,
      status: ListingStatus.published,
      pricing: {
        create: {
          basePrice: 5.5,
          currency: "USD",
          serviceFeePercent: 0,
          taxPercent: 12,
        },
      },
    },
  });

  // C. Catering (Foods)
  const catering = await prisma.listing.create({
    data: {
      hostId: hostUser.id,
      categoryId: weddingCat.id,
      title: "Five-Star Gourmet Buffet",
      description:
        "A curated selection of international cuisines, prepared by award-winning chefs. Includes appetizers, main courses, and a dessert bar.",
      type: ListingType.catering,
      status: ListingStatus.published,
      pricing: {
        create: {
          basePrice: 65,
          currency: "USD",
          serviceFeePercent: 15,
          taxPercent: 12,
        },
      },
    },
  });

  // 6. Link Foxer Service to Venue
  await prisma.listingFoxerService.create({
    data: {
      foxerId: foxerProfile.id,
      listingId: venue.id,
      categoryId: eventCat.id,
      serviceName: "Full Venue Styling",
      serviceDescription:
        "Complete transformation of the ballroom according to your theme.",
      price: 1200,
    },
  });

  console.log("Seeding finished successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

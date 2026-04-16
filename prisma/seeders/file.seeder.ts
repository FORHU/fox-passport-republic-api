import { PrismaClient } from "@prisma/client"

export async function seedFile(prisma: PrismaClient) {
    const users = await prisma.user.findMany()
    const assets = await prisma.asset.findMany()
    const venues = await prisma.venue.findMany()
    const services = await prisma.service.findMany()

  // User Profile Images
    for (const user of users) {
    await prisma.file.create({
        data: {
        url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
        name: `${user.username}_avatar.svg`,
        type: "image/svg+xml",
        userId: user.id,
        },
    })
    }

  // Asset Images
    for (const asset of assets) {
    await prisma.file.create({
        data: {
        url: `https://picsum.photos/seed/${asset.id}/800/600`,
        name: `${asset.name}_image.jpg`,
        type: "image/jpeg",
        assetId: asset.id,
        },
    })
    }

  // Venue Images
    for (const venue of venues) {
    await prisma.file.create({
        data: {
        url: `https://picsum.photos/seed/${venue.id}/1200/800`,
        name: `${venue.name}_main.jpg`,
        type: "image/jpeg",
        venueId: venue.id,
        },
    })
    }

  // Service Images
    for (const service of services) {
    await prisma.file.create({
        data: {
        url: `https://picsum.photos/seed/${service.id}/600/400`,
        name: `${service.name}_service.jpg`,
        type: "image/jpeg",
        serviceId: service.id,
        },
    })
    }
}

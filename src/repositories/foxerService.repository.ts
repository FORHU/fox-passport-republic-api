import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default class FoxerServiceRepo {
    // CREATE SERVICE LINK
    static async createService(data: {
        foxerId: string;
        listingId: string;
        categoryId: string;
        serviceName: string;
        serviceDescription?: string;
        price: number;
    }) {
        return prisma.listingFoxerService.create({
            data: {
                ...data,
                price: data.price
            }
        });
    }

    // GET SERVICES BY LISTING
    static async getServicesByListing(listingId: string) {
        return prisma.listingFoxerService.findMany({
            where: { listingId },
            include: {
                foxer: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                profileImage: true
                            }
                        }
                    }
                },
                category: true
            }
        });
    }

    // DELETE SERVICE
    static async deleteService(id: string) {
        return prisma.listingFoxerService.delete({
            where: { id }
        });
    }
}

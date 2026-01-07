import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default class FoxxerServiceRepo {
    // CREATE SERVICE LINK
    static async createService(data: {
        foxxerId: string;
        listingId: string;
        categoryId: string;
        serviceName: string;
        serviceDescription?: string;
        price: number;
    }) {
        return prisma.listingFoxxerService.create({
            data: {
                ...data,
                price: data.price
            }
        });
    }

    // GET SERVICES BY LISTING
    static async getServicesByListing(listingId: string) {
        return prisma.listingFoxxerService.findMany({
            where: { listingId },
            include: {
                foxxer: {
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
        return prisma.listingFoxxerService.delete({
            where: { id }
        });
    }
}

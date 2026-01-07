import FoxxerRepo from "../repositories/foxxer.repository";
import FoxxerServiceRepo from "../repositories/foxxerService.repository";
import CategoryRepo from "../repositories/category.repository";

export default class FoxxerSvc {
    // CATEGORIES (Mapping to unified CategoryRepo)
    static async createCategory(data: any) {
        return CategoryRepo.createCategory(data);
    }

    static async getAllCategories() {
        return CategoryRepo.getAllCategories();
    }

    // FOXXER PROFILE
    static async upsertFoxxerProfile(userId: string, data: any) {
        return FoxxerRepo.upsertFoxxerProfile(userId, data);
    }

    static async getFoxxerByUserId(userId: string) {
        return FoxxerRepo.getFoxxerByUserId(userId);
    }

    // SERVICES
    static async createListingService(data: any) {
        return FoxxerServiceRepo.createService(data);
    }

    static async getServicesByListing(listingId: string) {
        return FoxxerServiceRepo.getServicesByListing(listingId);
    }

    static async deleteService(id: string) {
        return FoxxerServiceRepo.deleteService(id);
    }
}

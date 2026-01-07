import FoxxerRepo from "../repositories/foxxer.repository";
import FoxxerServiceRepo from "../repositories/foxxerService.repository";
import EventCategoryRepo from "../repositories/eventCategory.repository";

export default class FoxxerSvc {
    // CATEGORIES
    static async createCategory(data: any) {
        return EventCategoryRepo.createCategory(data);
    }

    static async getAllCategories() {
        return EventCategoryRepo.getAllCategories();
    }

    // FOXXER PROFILE
    static async upsertFoxxerProfile(userId: string, data: any) {
        // Business logic could go here (e.g., verifying user exists)
        return FoxxerRepo.upsertFoxxerProfile(userId, data);
    }

    static async getFoxxerByUserId(userId: string) {
        return FoxxerRepo.getFoxxerByUserId(userId);
    }

    // SERVICES
    static async createListingService(data: any) {
        // Business logic: check if foxxer, listing, and category exist
        return FoxxerServiceRepo.createService(data);
    }

    static async getServicesByListing(listingId: string) {
        return FoxxerServiceRepo.getServicesByListing(listingId);
    }

    static async deleteService(id: string) {
        return FoxxerServiceRepo.deleteService(id);
    }
}

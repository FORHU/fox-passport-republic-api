import FoxerRepo from "../repositories/foxer.repository";
import FoxerServiceRepo from "../repositories/foxerService.repository";
import CategoryRepo from "../repositories/category.repository";

export default class FoxerSvc {
  // CATEGORIES (Mapping to unified CategoryRepo)
  static async createCategory(data: any) {
    return CategoryRepo.createCategory(data);
  }

  static async getAllCategories() {
    return CategoryRepo.getAllCategories();
  }

  // FOXER PROFILE
  static async upsertFoxerProfile(userId: string, data: any) {
    return FoxerRepo.upsertFoxerProfile(userId, data);
  }

  static async getFoxerByUserId(userId: string) {
    return FoxerRepo.getFoxerByUserId(userId);
  }

  // SERVICES
  static async createListingService(data: any) {
    return FoxerServiceRepo.createService(data);
  }

  static async getServicesByListing(listingId: string) {
    return FoxerServiceRepo.getServicesByListing(listingId);
  }

  static async deleteService(id: string) {
    return FoxerServiceRepo.deleteService(id);
  }
}

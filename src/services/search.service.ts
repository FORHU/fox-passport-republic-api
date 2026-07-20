import SearchRepo from "../repositories/search.repository";

export default class SearchSvc {
  static async searchByLocation(location?: string, category?: string) {
    return SearchRepo.searchByLocation(location, category);
  }
}

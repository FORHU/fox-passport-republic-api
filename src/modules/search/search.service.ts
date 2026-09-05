import SearchRepo from "./search.repository";

export default class SearchSvc {
  static async searchByLocation(
    location?: string,
    category?: string,
    page = 1,
    limit = 30,
  ) {
    return SearchRepo.searchByLocation(location, category, page, limit);
  }
}

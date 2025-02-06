import { ObjectId } from "mongodb";

import SpaceV2Repo from "../../repositories/repository-v2/space.repository";
import UserLogsV2Repo from "../../repositories/repository-v2/user-logs.repository";
import { TMostPopular } from "../../types/space";
import { getCacheOrFetch } from "../../utils/cache.util";
import { getOneSummarizedPricing, hashSearch, tenantBuildQuery } from "../../utils/helpers";
import { constructQueryV2 } from "../../utils/space/helpers";
import RatingSvc from "../rating.service";

const PREFIX_USER_LOGS = "user_logs";

export default class SpaceSvc {
  static async handleGetSpaces(params: any) {
    const { page = 1, limit = 10 } = params;
    const limitNumber = Number(limit);
    const skip = (page - 1) * limitNumber;
    const query = constructQueryV2(params);
    return SpaceV2Repo.getSpaces(query, limitNumber, skip);
  }

  static async handleGetSpace(spaceId: string) {
    const space_id = new ObjectId(spaceId);
    return SpaceV2Repo.getSpace({ _id: space_id });
  }

  static async handleGetMostPopularSpaces(params: TMostPopular) {
    const { page = 1, limit = 20, country, status, user_id, tenant_code, tenant } = params;

    const supportedCountries = tenant?.config?.SUPPORTED_COUNTRIES || [];

    const query = tenantBuildQuery({
      action: "VIEW_SPACE",
      status,
      tenant_code,
      tenant,
      country,
      supportedCountries: supportedCountries,
      ...(user_id && { user_id: new ObjectId(user_id) }),
    });

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const list_count = await getCacheOrFetch(hashSearch({ query, description: "countGetMostPopularSpaces" }), PREFIX_USER_LOGS, () =>
      UserLogsV2Repo.countGetMostPopularSpaces({ query }),
    );

    const lists = await getCacheOrFetch(hashSearch({ query, description: "getMostPopularSpaces" }), PREFIX_USER_LOGS, () =>
      UserLogsV2Repo.handleGetMostPopularSpaces(query, skip, limitNumber),
    );

    const updatedLists = await Promise.all(
      lists.map(async (item: any) => {
        const [rating] = (await RatingSvc.getOverAllRating(item?._id.toString())) || [null];
        const ratingWithoutDetails = rating ? { ...rating, details: undefined } : { averageRating: 0, totalRating: 0, totalReviews: 0 };
        const pricingSummary = getOneSummarizedPricing({
          space_id: item?.pricing?.space_id.toString(),
          selected_pricing: item?.pricing?.selected_pricing || null,
          currency: item?.pricing?.currency || "USD",
          hire_fee: item?.pricing?.hire_fee || [],
          custom_price: item?.pricing?.custom_price || [],
          cleaning_fee: item?.pricing?.cleaning_fee || 0,
        });

        return {
          ...item,
          rating: ratingWithoutDetails,
          pricing_summary: pricingSummary,
        };
      }),
    );

    return {
      data: updatedLists,
      total_pages: Math.ceil(list_count / limitNumber) || 0,
      total_items: list_count,
      current_page: pageNumber,
      size: limitNumber,
      offset: skip,
    };
  }
}

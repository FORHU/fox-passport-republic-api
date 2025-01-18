import { ObjectId } from "mongodb";

import UserLogsV2Repo from "../../repositories/repository-v2/user-logs.repository";
import SpaceV2Repo from "../../repositories/repository-v2/space.repository";
import { TMostPopular } from "../../types/space";
import { getOneSummarizedPricing, hashSearch } from "../../utils/helpers";
import RedisUtil from "../../utils/redis.util";
import { constructQueryV2 } from "../../utils/space/helpers";

// const PREFIX = "spaces";
const PREFIX_USER_LOGS = "user_logs";

export default class SpaceSvc {
  static async handleGetSpaces(params: any) {
    const { page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;
    const query = constructQueryV2(params);
    return SpaceV2Repo.getSpaces(query, limit, skip);
  }

  static async handleGetSpace(spaceId: string) {
    const space_id = new ObjectId(spaceId);
    return SpaceV2Repo.getSpace({ _id: space_id });
  }

  static async handleGetMostPopularSpaces(params: TMostPopular) {
    const { page = 1, limit = 20, country, status, user_id, tenant_code } = params;

    const query: any = {
      action: "VIEW_SPACE",
      space: {
        status,
      },
      venue: {
        ...(tenant_code ? { tenant: tenant_code } : { address: { country } }),
      },
      ...(user_id && { user_id: new ObjectId(user_id) }),
    };

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // checker of redis of count of spaces
    let list_count = null;
    const hashCountSpace = hashSearch(query);
    const cacheCountSpace = await RedisUtil.getCache(hashCountSpace, PREFIX_USER_LOGS);
    if (!cacheCountSpace) {
      list_count = await UserLogsV2Repo.countGetMostPopularSpaces({ query });
      await RedisUtil.saveCache({ key: hashCountSpace, data: JSON.stringify(list_count), prefix: PREFIX_USER_LOGS });
    } else {
      list_count = JSON.parse(cacheCountSpace);
    }

    // checker of redis of lists of spaces
    let lists = null;
    const hashSpaceList = hashSearch({ query, pageNumber, limitNumber });
    const cacheSpaceList = await RedisUtil.getCache(hashSpaceList, PREFIX_USER_LOGS);
    if (!cacheSpaceList) {
      lists = await UserLogsV2Repo.handleGetMostPopularSpaces(query, skip, limitNumber);
      await RedisUtil.saveCache({ key: hashSpaceList, data: JSON.stringify(lists), prefix: PREFIX_USER_LOGS });
    } else {
      lists = JSON.parse(cacheSpaceList);
    }

    const updatedLists = lists.map((item: any) => {
      return {
        ...item,
        pricing_summary: getOneSummarizedPricing({
          space_id: item?.pricing?.space_id.toString(),
          selected_pricing: item?.pricing?.selected_pricing || null,
          currency: item?.pricing?.currency || "USD",
          hire_fee: item?.pricing?.hire_fee || [],
          custom_price: item?.pricing?.custom_price || [],
          cleaning_fee: item?.pricing?.cleaning_fee || 0,
        }),
      };
    });

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

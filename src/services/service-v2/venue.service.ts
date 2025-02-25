import { ObjectId } from "mongodb";
import { actions_enums } from "../../models/user-logs.model";
import { TVenue, venue_status } from "../../models/venue.models";
import { hashSearch, sendTemplatedEmail } from "../../utils/helpers";
import VenueRepo from "../../repositories/repository-v2/venue.repository";
import RedisUtil from "../../utils/redis.util";
import CountrySettingSvc from ".././country-setting.service"; // TODO v2
import KeywordSvc from ".././keyword.service"; // TODO v2
import UserLogsSvc from ".././user-logs.service"; // TODO v2
import { constructVenueV2Query } from "../../utils/venue/helper";

// import { CC_SUPPORT_EMAIL, SUPPORT_EMAIL, VENUE_4_USE_URI } from "../../config";
// import { formatDate } from "../../models/enquiries.model";
// import { space_status } from "../../models/space.model";

// import EmailLogsRepo from "../../repositories/email_logs.repository";
// import SpaceRepository from "../../repositories/space.repository";

// import { USER_ROLES } from "../../utils/constant";

// import { logger } from "../../utils/logger";
// import { parseQuestion } from "../../utils/question/utils";

// import { constructVenueQuery } from "../../utils/venue/helper";
// import AdminSvc from ".././admin.service";
// import CancellationPolicySvc from ".././cancellation-policy.service";

// import QuestionSvc from ".././questions.service";
// import SaleTransactionSvc from ".././sale-transactions.service";
// import SpaceSvc from ".././space.service";

// import UserRepo from "../../repositories/user.repository";

const PREFIX = "venues";

export default class VenueSvc {
  static async processVenueCreation(user: any, payload: any) {
    const { name, keywords, description, representation, form_steps = 1, status = venue_status.DRAFT, payment_method, tenant } = payload;

    const country = user?.country || "SG";
    const user_role = user?.role;
    const [country_settings] = await CountrySettingSvc.getCountrySetting({ cca2: country });

    let country_commission = 0.15,
      country_rebate = 0;

    if (user_role !== "ADMIN" && [venue_status.REQUIRES_CONSENT, venue_status.PENDING].includes(status)) {
      throw new Error("Only ADMIN can set the status to PENDING or REQUIRES_CONSENT.");
    }

    if (country_settings) {
      country_commission = country_settings.commission;
      country_rebate = country_settings.rebate;
    }

    let newKeywords: Array<any> = [];
    if (keywords && Array.isArray(keywords)) {
      newKeywords = await KeywordSvc.handleParsingKeywords(keywords); // TODO v2. categories should not be an array. no record of category being more than 1 for each keywords
    }

    const venueId = new ObjectId();
    const venueData = {
      _id: venueId,
      user: user._id,
      name,
      ...(user.role !== "ADMIN" && { organization: user.organization }),
      ...(representation && { representation }),
      ...(description && { description }),
      ...(newKeywords.length > 0 && { keywords: newKeywords }),
      form_steps,
      status,
      ...(country_commission && { commission: country_commission }),
      ...(country_rebate && { rebate: country_rebate }),
      payment_method,
      ...(tenant && { tenant }),
    };

    const query = {
      user: new ObjectId(user?._id as string),
      details: { venue: venueId },
      action: actions_enums.VIEW_VENUE,
    };

    const existingLogs = await UserLogsSvc.getUser(query);
    const count = existingLogs?.count || 0;
    await UserLogsSvc.updateUserlogs(query, { count: count + 1, updatedAt: new Date(), action: actions_enums.VIEW_VENUE });
    return VenueRepo.createVenue(venueData);
  }

  static async getVenueName(query: any) {
    try {
      const result = await VenueRepo.getVenueNames(query);
      console.log(result);
      return result;
    } catch (error) {
      console.error("Failed to process fetching of venue name", error);
      throw new Error("Failed to fetch venue name");
    }
  }

  static async processedVenuePagination(params: any, user: any, venues: any) {
    const { page = 1, limit = 20 } = params as any;

    const query = constructVenueV2Query(params, user, venues);

    const pageNumber = parseInt(page.toString());
    const limitNumber = parseInt(limit.toString());
    const offset = (pageNumber - 1) * limitNumber;

    let list_count = 0;
    const hashCount = hashSearch({ query, description: "countVenues" });
    const cacheCount = await RedisUtil.getCache(hashCount, PREFIX);
    if (!cacheCount) {
      list_count = await VenueRepo.countVenues(query);
      await RedisUtil.saveCache({ key: hashCount, data: list_count, prefix: PREFIX });
    } else {
      list_count = Number(cacheCount);
    }

    let list = null;
    const hashList = hashSearch({ query, offset, limitNumber, description: "getPaginatedVenues" });
    const cacheList = await RedisUtil.getCache(hashList, PREFIX);

    const project = {
      _id: 1,
      user: 1,
      name: 1,
      representation: 1,
      description: 1,
      keywords: 1,
      cancellation_policy: 1,
      foods_and_beverages: 1,
      venue_details: 1,
      address: 1,
      status: 1,
      organization: 1,
      age_restriction: 1,
      commission: 1,
      rebate: 1,
      payment_method: 1,
      venue_photos: 1,
      space_photos: 1,
      spaces: 1,
      createdAt: 1,
      updatedAt: 1,
      latestDate: 1,
    };

    if (!cacheList) {
      list = await VenueRepo.getPaginatedVenues(query, offset, limitNumber, project);
      await RedisUtil.saveCache({ key: hashList, data: JSON.stringify(list), prefix: PREFIX });
    } else {
      list = JSON.parse(cacheList);
    }

    return {
      data: list,
      total_pages: Math.ceil(list_count / limitNumber) || 0,
      total_items: list_count,
      current_page: page,
      size: limitNumber,
      offset,
    };
  }

  static async updateVenue(venueId: string | ObjectId, payload: TVenue) {
    try {
      const result = await VenueRepo.updateVenue(venueId, payload);
      return result;
    } catch (error) {
      console.error("Failed to process updating of venue", error);
      throw new Error("Failed to update venue");
    }
  }
}

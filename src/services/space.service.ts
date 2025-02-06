import dayjs from "dayjs";
import { ObjectId } from "mongodb";

import { CC_SUPPORT_EMAIL, SUPPORT_EMAIL, VENUE_4_USE_URI } from "../config";
import { formatDate } from "../models/enquiries.model";
import { space_status, TSpace } from "../models/space.model";
import PricingRepo from "../repositories/pricing.repository";
import SpaceRepo from "../repositories/space.repository";
import UserLogsRepo from "../repositories/user-logs.repository";
import { PaginationType, RequestWithParamsAndUser } from "../types/common";
import { TMostPopular } from "../types/space";
import { processBookingsAndPricing } from "../utils/bookings/bookingUtils";
import { getOneSummarizedPricing, getSummarizedPricing, hashSearch, parseDate, PricingData, sendTemplatedEmail } from "../utils/helpers";
import { parseQuestion } from "../utils/question/utils";
import RedisUtil from "../utils/redis.util";
import { constructQuery } from "../utils/space/helpers";
import KeywordSvc from "./keyword.service";
import PricingSvc from "./pricing.service";
import QuestionSvc from "./questions.service";
import UserSvc from "./user.service";
import UserLogsSvc from "./user-logs.service";
import VenueSvc from "./venue.service";
import RatingSvc from "./rating.service";

const PREFIX = "spaces";
const PREFIX_USER_LOGS = "user_logs";

export default class SpaceSvc {
  static async getPaginatedSpaces({ query, skip, limit, user_id, mark_as_favorite, startDate, endDate }: PaginationType) {
    try {
      const results = await SpaceRepo.getPaginatedSpaces({
        query,
        skip,
        limit,
        user_id,
        mark_as_favorite,
        startDate,
        endDate,
      });

      return await Promise.all(
        results.map(async (result: any) => {
          const [rating] = await RatingSvc.getOverAllRating(result._id.toString());
          if (!rating) return { ...result, rating: { averageRating: 0, totalRating: 0, totalReviews: 0 } };
          // eslint-disable-next-line no-unused-vars
          const { details, ...ratingWithoutDetails } = rating;
          return { ...result, rating: ratingWithoutDetails };
        }),
      );
    } catch (error) {
      throw new Error("Failed to get spaces");
    }
  }

  static async processedSpacePagination({ params, user }: RequestWithParamsAndUser) {
    try {
      const { page = 1, limit = 20, mark_as_favorite, start_date, start_time, end_time } = params as any;

      let dayOfWeek: any;
      let filteredSpaces: any;

      if (start_date && !start_time && !end_time) {
        const date = dayjs(start_date);
        dayOfWeek = date.format("dddd").toUpperCase();
        filteredSpaces = await processBookingsAndPricing(start_date, dayOfWeek);
      }

      const query = constructQuery(params, start_time, end_time, filteredSpaces);
      const pageNumber = parseInt(page.toString());
      const limitNumber = parseInt(limit.toString());
      const offset = (pageNumber - 1) * limitNumber;

      let startDateTime: Date | null = null;
      let endDateTime: Date | null = null;

      if (start_date) {
        const time = start_time || end_time || "00:00";
        startDateTime = parseDate(start_date, time);
      } else {
        const today = new Date();
        const currentDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;
        startDateTime = parseDate(currentDate, end_time || "00:00");
      }

      if (end_time) {
        const effectiveStartTime = start_time || end_time;
        endDateTime = parseDate(start_date || startDateTime.toISOString().split("T")[0], end_time);

        if (effectiveStartTime === end_time) {
          const adjustedStartDateTime = new Date(startDateTime);
          adjustedStartDateTime.setHours(adjustedStartDateTime.getHours() + 1);
          if (endDateTime < adjustedStartDateTime) {
            endDateTime = adjustedStartDateTime;
          }
        }
      } else {
        endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 1);
      }

      let list_count = 0;
      const countPayload = {
        query,
        user_id: user ? new ObjectId(user._id as string) : null,
        mark_as_favorite,
        ...(startDateTime ? { startDate: startDateTime } : {}),
        ...(endDateTime ? { endDate: endDateTime } : {}),
      };

      const hashCount = hashSearch({ countPayload, description: "countPaginatedSpaces" });
      const cacheCount = await RedisUtil.getCache(hashCount, PREFIX);

      if (!cacheCount) {
        list_count = await this.countPaginatedSpaces(countPayload);
        await RedisUtil.saveCache({ key: hashCount, data: list_count, prefix: PREFIX });
      } else {
        list_count = Number(cacheCount);
      }

      const spacesPayload = {
        query,
        skip: offset,
        limit: limitNumber,
        user_id: user ? new ObjectId(user._id as string) : null,
        mark_as_favorite,
        ...(startDateTime ? { startDate: startDateTime } : {}),
        ...(endDateTime ? { endDate: endDateTime } : {}),
      };

      let list = null;
      const hashSpacePayload = hashSearch({ spacesPayload, description: "getPaginatedSpacesWithPricing" });
      const cacheSpacePayload = await RedisUtil.getCache(hashSpacePayload, PREFIX);

      let updatedList = null;

      if (!cacheSpacePayload) {
        // Fetch spaces from the database
        list = await this.getPaginatedSpaces(spacesPayload);
        // Get pricing details for spaces
        const spaceIdList = list.map((s: any) => new ObjectId(s._id as string));
        const priceList = await PricingRepo.getPrices({ space_id: { $in: spaceIdList } });

        // Transform pricing data
        const transformedPriceList: PricingData[] = priceList.map((price: any) => ({
          space_id: price.space_id.toString(),
          selected_pricing: price.selected_pricing || null,
          currency: price.currency || "USD",
          hire_fee: price.hire_fee || 0,
          cleaning_fee: price.cleaning_fee || 0,
          custom_price: price.custom_price || 0,
        }));

        const summarizedPricing = await getSummarizedPricing(transformedPriceList);
        const pricingMap = new Map(summarizedPricing.map((item: any) => [item.space_id, item]));

        updatedList = list.map((space: any) => ({
          ...space,
          pricing_summary: pricingMap.get(space._id.toString()) || null,
        }));

        await RedisUtil.saveCache({
          key: hashSpacePayload,
          data: JSON.stringify(updatedList),
          prefix: PREFIX,
        });
      } else {
        updatedList = JSON.parse(cacheSpacePayload);
      }

      return {
        data: updatedList,
        total_pages: Math.ceil(list_count / limitNumber) || 0,
        total_items: list_count,
        current_page: page,
        size: limitNumber,
        offset,
      };
    } catch (error) {
      throw new Error("Failed to get spaces");
    }
  }

  static async getSpaceKeywords(pagination: PaginationType) {
    return await SpaceRepo.getSpaceKeywords(pagination);
  }

  static async getSpace(query: any) {
    try {
      return await SpaceRepo.getSpace(query);
    } catch (error) {
      throw new Error("Failed to get space");
    }
  }

  static async countPaginatedSpaces({ query, user_id, mark_as_favorite, startDate, endDate }: PaginationType) {
    try {
      return await SpaceRepo.countPaginatedSpaces({ query, user_id, mark_as_favorite, startDate, endDate });
    } catch (error) {
      throw new Error("Failed to count spaces");
    }
  }

  static async countSpaces(query: any) {
    return await SpaceRepo.countSpaces(query);
  }

  static async createSpaces(payload: any, user?: any) {
    try {
      const { venue_id, name, type, representation, description, status } = payload;

      const user_role = user?.role;
      if (user_role !== "ADMIN" && [space_status.REQUIRES_CONSENT, space_status.PENDING].includes(status)) {
        throw new Error("Only ADMIN can set the status to PENDING or REQUIRES_CONSENT.");
      }

      const newSpaceData = {
        venue: new ObjectId(venue_id),
        user: new ObjectId(user?._id),
        name,
        status,
        ...(representation && { representation }),
        ...(type && { type }),
        ...(description && { description }),
      };

      return await SpaceRepo.createSpaces(newSpaceData);
    } catch (error) {
      throw new Error("Failed to create space");
    }
  }

  static async processUpdateSpaces(payload: any, spaceId: ObjectId, space: any, userRole: any, tenant?: any) {
    const {
      status,
      name,
      type,
      representation,
      description,
      space_photo,
      venue_photo,
      capacity_layout,
      guest_capacity,
      floor_plan,
      features,
      keywords,
      pricing,
      form_steps,
    } = payload;

    let capacityLayoutIds = null;
    let featureIds = null;
    const updatedAt = new Date();

    if (userRole !== "ADMIN" && [space_status.REQUIRES_CONSENT, space_status.PENDING].includes(status)) {
      throw new Error("Only ADMIN can set the status to PENDING or REQUIRES_CONSENT.");
    }
    // if (name !== null && name !== undefined && name !== "") {
    //   const space_name = await this.getSpace({ name: name });
    //   if (space_name && String(space_name?._id) !== String(spaceId)) {
    //     throw new Error("Space name already exists");
    //   }
    // }

    space.space_photo = space_photo;
    space.venue_photo = venue_photo;
    space.guest_capacity = guest_capacity;
    space.floor_plan = floor_plan;
    space.keywords = !keywords || keywords.length < 1 ? space.keywords : keywords;
    space.pricing = pricing;

    const parseObjectIdArray = (array: string[] | undefined) => {
      return array ? array.map((_id: string) => new ObjectId(_id)) : null;
    };

    // eslint-disable-next-line no-unused-vars
    const updateQuestionData = async (data: any, existingData: any[]) => {
      if (data) {
        if (existingData && existingData.length > 0) {
          const objectIds = existingData.map((id: any) => new ObjectId(id as string));
          await QuestionSvc.deleteQuestions(objectIds);
        }

        const parsedData = parseQuestion(data, spaceId, "SPACE");
        const result = await QuestionSvc.createQuestions(parsedData);
        const upsertedIds = result.upsertedIds;

        // eslint-disable-next-line no-unused-vars
        return Object.entries(upsertedIds).map(([key, value]) => new ObjectId(value as string));
      }
    };

    if (capacity_layout) {
      capacityLayoutIds = await updateQuestionData(capacity_layout, space.capacity_layout);
    }

    if (features && features.length > 0) {
      featureIds = await updateQuestionData(features, space.features);
    }

    let keywordsIds = space.keywords.map((item) => item._id);
    if (keywords) {
      keywordsIds = await KeywordSvc.handleParsingKeywords(space.keywords);
    }

    let pricingId = null;
    if (pricing) {
      const existingPrice = await PricingSvc.getPrice({ space_id: spaceId });
      if (existingPrice && space.pricing) {
        pricingId = existingPrice?._id;
        await PricingSvc.updatePrice(spaceId, pricing);
      } else {
        pricing.space_id = spaceId;
        const newPrice: any = await PricingSvc.createPrice(pricing);
        pricingId = newPrice.insertedId;
      }
    }

    const updatedData = {
      _id: spaceId,
      ...(status && { status }),
      ...(form_steps && { form_steps }),
      ...(name && { name }),
      ...(type && { type }),
      ...(representation && { representation }),
      ...(description && { description }),
      ...(space_photo && { space_photo: parseObjectIdArray(space_photo) }),
      ...(venue_photo && { venue_photo: parseObjectIdArray(venue_photo) }),
      ...(capacity_layout && { capacity_layout: capacityLayoutIds }),
      ...(guest_capacity && { guest_capacity }),
      ...(floor_plan && { floor_plan: parseObjectIdArray(floor_plan) }),
      ...(features && { features: featureIds }),
      ...(keywords && { keywords: keywordsIds }),
      ...(pricing && { pricing: pricingId }),
      updatedAt: updatedAt,
    };

    await VenueSvc.updateVenue(space.venue, { updatedAt: updatedAt }, tenant);
    return await this.updateSpaces(updatedData, { _id: spaceId }, tenant);
  }

  static async updateSpaces(payload: Partial<TSpace>, query: any, tenant?: any) {
    try {
      const message = null;

      await this.sendEmailNotif(query, payload.status, tenant);
      const result = await SpaceRepo.updateSpaces(payload, query);
      return {
        result: result,
        message: message,
      };
    } catch (error) {
      throw new Error("Failed to update space");
    }
  }

  static async sendEmailNotif(query: any, status: string, send = true, tenant?: any) {
    if (send && status && status === "FOR_APPROVAL") {
      const [spaceData] = await SpaceRepo.getPaginatedSpaces({ query: query, skip: 0, limit: 1, user_id: null });
      const dateSubmitted = new Date().toISOString();
      const date_submitted = formatDate(dateSubmitted);

      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Space For Approval`,
        email_data: {
          email: spaceData.venue.user.email,
          first_name: spaceData?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
          venue_name: spaceData?.venue?.name?.replace(/_/g, " ") || " ",
          space_name: spaceData?.name?.replace(/_/g, " ") || " ",
          date_submitted: date_submitted?.replace(/_/g, " "),
        },
        template_name: "space-for-approval.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Space Approval Needed`,
        email_data: {
          // Owner Details
          verification_link: `${VENUE_4_USE_URI}/sg/venues/management/venue/${spaceData.venue._id}/spaces/${spaceData._id}`,
          first_name: spaceData?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue",
          last_name: spaceData?.venue?.user?.last_name?.replace(/_/g, " ") || "Owner",
          phone_number: spaceData?.venue?.user?.phone_number?.replace(/_/g, " ") || " ",
          owner_email: spaceData?.venue?.user?.email,

          // Venue Details
          venue_name: spaceData?.venue?.name?.replace(/_/g, " ") || " ",
          street: spaceData?.venue?.address?.street?.replace(/_/g, " ") || " ",
          city: spaceData?.venue?.address?.city?.replace(/_/g, " ") || " ",
          postal_code: spaceData?.venue?.address?.postal_code?.replace(/_/g, " ") || " ",
          country: spaceData?.venue?.address?.country?.replace(/_/g, " ") || " ",
          venue_description: spaceData?.venue?.description?.replace(/_/g, " ") || " ",

          // Space Details
          space_name: spaceData?.name?.replace(/_/g, " ") || " ",
          space_type: spaceData?.type?.replace(/_/g, " ") || " ",
          representation: spaceData?.representation?.replace(/_/g, " ") || " ",

          // Date Submitted
          date_submitted: date_submitted?.replace(/_/g, " "),

          // Support and CC Emails
          email: SUPPORT_EMAIL,
        },
        cc: CC_SUPPORT_EMAIL,
        template_name: "space-approval-notification.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });
    }
  }
  static async deleteMultipleSpaceByIds(space_ids: ObjectId[]) {
    try {
      const query = { _id: { $in: space_ids } };
      return await SpaceRepo.deleteSpaces(query);
    } catch (error) {
      throw new Error("Failed to delete draft spaces");
    }
  }

  static async getMultipleSpaces(query: any) {
    return SpaceRepo.getMultipleSpaces(query);
  }

  static async getMostPopularSpaces(params: any) {
    const { skip = 1, limit = 20 } = params;

    let mostPopularIds: any;
    if (params.location) {
      let venue = null;
      const hashVenue = hashSearch({ "address.country": params.location, status: "PUBLISHED" });
      const cacheVenue = await RedisUtil.getCache(hashVenue, PREFIX);

      if (!cacheVenue) {
        venue = await VenueSvc.getVenue({ "address.country": params.location, status: "PUBLISHED" });
        await RedisUtil.saveCache({ key: hashVenue, data: JSON.stringify(venue), prefix: PREFIX });
      } else {
        venue = JSON.parse(cacheVenue);
      }

      //venue = await VenueSvc.getVenue({ "address.country": params.location, status: "PUBLISHED" });
      const venueIds = venue.map((v: any) => new ObjectId(v._id));

      let spaceIds = null;
      const hashSpace = hashSearch({ venue: { $in: venueIds } });
      const cacheSpace = await RedisUtil.getCache(hashSpace, PREFIX);

      if (!cacheSpace) {
        spaceIds = await this.getMultipleSpaces({ venue: { $in: venueIds } });
        await RedisUtil.saveCache({ key: hashSpace, data: JSON.stringify(spaceIds), prefix: PREFIX });
      } else {
        spaceIds = JSON.parse(cacheSpace);
      }

      const hashCountUserLogs = hashSearch({
        action: "VIEW_SPACE",
        "details.space": { $in: spaceIds.map((s: any) => new ObjectId(s._id)) },
      });

      const cacheCountUserLogs = await RedisUtil.getCache(hashCountUserLogs, PREFIX);

      if (!cacheCountUserLogs) {
        mostPopularIds = await UserLogsSvc.countUserLogs({
          action: "VIEW_SPACE",
          "details.space": { $in: spaceIds.map((s: any) => new ObjectId(s._id)) },
        });
        await RedisUtil.saveCache({ key: hashCountUserLogs, data: JSON.stringify(mostPopularIds), prefix: PREFIX });
      } else {
        mostPopularIds = JSON.parse(cacheCountUserLogs);
      }

      if (mostPopularIds.length === 0) {
        mostPopularIds = null;
      }
    }

    const query = constructQuery(params, null, null, null, mostPopularIds);

    const pageNumber = parseInt(skip.toString());
    const limitNumber = parseInt(limit.toString());
    const offset = (pageNumber - 1) * limitNumber;
    //joel
    let list_count = null;
    const hashCountSpace = hashSearch(query);
    const cacheCountSpace = await RedisUtil.getCache(hashCountSpace, PREFIX);
    if (!cacheCountSpace) {
      list_count = await SpaceRepo.countPaginatedSpaces({ query });
      await RedisUtil.saveCache({ key: hashCountSpace, data: JSON.stringify(list_count), prefix: PREFIX });
    } else {
      list_count = JSON.parse(cacheCountSpace);
    }

    let list = null;
    const hashSpaceList = hashSearch({ query, pageNumber, limitNumber });
    const cacheSpaceList = await RedisUtil.getCache(hashSpaceList, PREFIX);

    if (!cacheSpaceList) {
      list = await SpaceRepo.getMostPopularSpaces(query, pageNumber, limitNumber);

      await RedisUtil.saveCache({ key: hashSpaceList, data: JSON.stringify(list), prefix: PREFIX });
    } else {
      list = JSON.parse(cacheSpaceList);
    }

    if (mostPopularIds && mostPopularIds.length > 0) {
      const sortedIds = mostPopularIds.map((log: any) => log._id.toString());
      list = list.sort((a: any, b: any) => {
        return sortedIds.indexOf(a._id.toString()) - sortedIds.indexOf(b._id.toString());
      });
    }
    // TO DO: {Section Start} Move this section that is also passed to the cache
    const spaceIdList = list.map((s: any) => new ObjectId(s._id));
    const priceList = await PricingRepo.getPrices({ space_id: { $in: spaceIdList } });

    const transformedPriceList: PricingData[] = priceList.map((price: any) => ({
      space_id: price.space_id.toString(),
      selected_pricing: price.selected_pricing || null,
      currency: price.currency || "USD",
      hire_fee: price.hire_fee || 0,
      cleaning_fee: price.cleaning_fee || 0,
      custom_price: price.custom_price || 0,
    }));

    let updatedList;
    const summarizedPricing = await getSummarizedPricing(transformedPriceList);
    const pricingMap = new Map(summarizedPricing.map((item: any) => [item.space_id, item]));

    // Attach summarized pricing to spaces
    updatedList = list.map((space: any) => ({
      ...space,
      pricing_summary: pricingMap.get(space._id.toString()) || null,
    }));
    // {Section end}
    const result: any = {
      data: updatedList,
      total_pages: Math.ceil(list_count / limitNumber) || 0,
      total_items: list_count,
      current_page: skip,
      size: limitNumber,
      offset,
    };
    return result;
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
      list_count = await UserLogsRepo.countGetMostPopularSpaces({ query });
      await RedisUtil.saveCache({ key: hashCountSpace, data: JSON.stringify(list_count), prefix: PREFIX_USER_LOGS });
    } else {
      list_count = JSON.parse(cacheCountSpace);
    }

    // checker of redis of lists of spaces
    let lists = null;
    const hashSpaceList = hashSearch({ query, pageNumber, limitNumber });
    const cacheSpaceList = await RedisUtil.getCache(hashSpaceList, PREFIX_USER_LOGS);
    if (!cacheSpaceList) {
      lists = await UserLogsRepo.handleGetMostPopularSpaces(query, skip, limitNumber);
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

  static async getRecentlyListedSpaces({ params, user }: RequestWithParamsAndUser) {
    const { page = 1, limit = 20, mark_as_favorite, start_date, start_time, end_time } = params as any;

    let dayOfWeek: any;
    let filteredSpaces: any;

    // Process dayOfWeek if only start_date is provided
    if (start_date && !start_time && !end_time) {
      const date = dayjs(start_date);
      dayOfWeek = date.format("dddd").toUpperCase();
      filteredSpaces = await processBookingsAndPricing(start_date, dayOfWeek);
    }

    // Construct query
    const query = constructQuery(params, start_time, end_time, filteredSpaces);
    const pageNumber = parseInt(page.toString());
    const limitNumber = parseInt(limit.toString());
    const offset = (pageNumber - 1) * limitNumber;

    let startDateTime: Date | null = null;
    let endDateTime: Date | null = null;

    if (start_date) {
      const time = start_time || end_time || "00:00";
      startDateTime = parseDate(start_date, time);
    } else {
      const today = new Date();
      const currentDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;
      startDateTime = parseDate(currentDate, end_time || "00:00");
    }

    if (end_time) {
      const effectiveStartTime = start_time || end_time;
      endDateTime = parseDate(start_date || startDateTime.toISOString().split("T")[0], end_time);

      if (effectiveStartTime === end_time) {
        const adjustedStartDateTime = new Date(startDateTime);
        adjustedStartDateTime.setHours(adjustedStartDateTime.getHours() + 1);
        if (endDateTime < adjustedStartDateTime) {
          endDateTime = adjustedStartDateTime;
        }
      }
    } else {
      endDateTime = new Date(startDateTime);
      endDateTime.setHours(endDateTime.getHours() + 1);
    }

    let list_count = null;
    const spaceCountPayload = {
      query,
      user_id: user ? new ObjectId(user._id as string) : null,
      mark_as_favorite,
      ...(startDateTime ? { startDate: startDateTime } : {}),
      ...(endDateTime ? { endDate: endDateTime } : {}),
    };

    const hashSpaceCount = hashSearch({ spaceCountPayload, description: "countPaginatedSpaces" });
    const cacheSpaceCount = await RedisUtil.getCache(hashSpaceCount, PREFIX);

    if (!cacheSpaceCount) {
      list_count = await this.countPaginatedSpaces(spaceCountPayload);
      await RedisUtil.saveCache({ key: hashSpaceCount, data: JSON.stringify(list_count), prefix: PREFIX });
    } else {
      list_count = JSON.parse(cacheSpaceCount);
    }

    const spacesPayload = {
      query,
      skip: offset,
      limit: limitNumber,
      user_id: user ? new ObjectId(user._id as string) : null,
      mark_as_favorite,
      ...(startDateTime ? { startDate: startDateTime } : {}),
      ...(endDateTime ? { endDate: endDateTime } : {}),
    };

    const hashSpacePayload = hashSearch({ spacesPayload, description: "getPaginatedSpacesWithPricing" });
    const cacheSpacePayload = await RedisUtil.getCache(hashSpacePayload, PREFIX);

    let updatedList = null;

    if (!cacheSpacePayload) {
      const list = await this.getPaginatedSpaces(spacesPayload);

      const spaceIdList = list.map((s: any) => new ObjectId(s._id as string));
      const priceList = await PricingRepo.getPrices({ space_id: { $in: spaceIdList } });

      const transformedPriceList: PricingData[] = priceList.map((price: any) => ({
        space_id: price.space_id.toString(),
        selected_pricing: price.selected_pricing || null,
        currency: price.currency || "USD",
        hire_fee: price.hire_fee || 0,
        cleaning_fee: price.cleaning_fee || 0,
        custom_price: price.custom_price || 0,
      }));

      const summarizedPricing = await getSummarizedPricing(transformedPriceList);
      const pricingMap = new Map(summarizedPricing.map((item: any) => [item.space_id, item]));

      updatedList = list.map((space: any) => ({
        ...space,
        pricing_summary: pricingMap.get(space._id.toString()) || null,
      }));

      await RedisUtil.saveCache({
        key: hashSpacePayload,
        data: JSON.stringify(updatedList),
        prefix: PREFIX,
      });
    } else {
      updatedList = JSON.parse(cacheSpacePayload);
    }

    return {
      data: updatedList,
      total_pages: Math.ceil(list_count / limitNumber) || 0,
      total_items: list_count,
      current_page: page,
      size: limitNumber,
      offset,
    };
  }

  static async getSpaceNameIdAndStatus(payload: RequestWithParamsAndUser) {
    const { params, user } = payload;
    const { venue_id, status, tenant_code } = params;
    const userRole = user.role;
    const query: any = {};
    let statusArray: any;
    const userDetails = await UserSvc.getUser({ _id: new ObjectId(user._id as string) });
    const organization = userDetails.organization;

    if (venue_id) {
      query["venue._id"] = new ObjectId(venue_id as string);
    }

    if (tenant_code) {
      query["venue.tenant"] = tenant_code;
    }

    if (statusArray) {
      query.status = { $in: status };
    }

    if (userRole !== "ADMIN") {
      query["user.organization"] = organization;
    }

    let results = null;

    const hashSpaceName = hashSearch({ query, description: "getSpaceNameIdAndStatus" });
    const cacheSpaceName = await RedisUtil.getCache(hashSpaceName, PREFIX);
    if (!cacheSpaceName) {
      results = await SpaceRepo.getSpaceNameIdAndStatus(query);
      await RedisUtil.saveCache({ key: hashSpaceName, data: JSON.stringify(results), prefix: PREFIX });
    } else {
      results = JSON.parse(cacheSpaceName);
    }

    return results;
  }

  static async getPaginatedSpaceList(params: any, user: any) {
    const { page = 1, limit = 20, venueId, status } = params;
    const pageNumber = parseInt(page.toString());
    const limitNumber = parseInt(limit.toString());
    const userId = new ObjectId(user._id);
    const userRole = user.role;
    const offset = (page - 1) * limit;
    const query: any = {};

    if (venueId) {
      query.venue = new ObjectId(venueId);
    }

    if (status) {
      query.status = { $in: status.split(",").map((s: string) => s.trim()) };
    }

    if (userRole !== "ADMIN") {
      query.user = userId;
    }

    const subscribedSpaces = await SpaceRepo.getSpaceList({ query, skip: pageNumber, limit: limitNumber });
    const count = await SpaceRepo.countSpaces({ ...query, status: { $ne: "DELETED" } });

    const result = {
      data: subscribedSpaces,
      total_pages: Math.ceil(subscribedSpaces.length / limitNumber) || 0,
      total_items: subscribedSpaces.length,
      current_active: count,
      current_page: pageNumber,
      size: limitNumber,
      offset,
    };
    return result;
  }

  static async deleteSpaces(query: TSpace) {
    try {
      return await SpaceRepo.deleteSpaces(query);
    } catch (error) {
      throw new Error("Failed to delete spaces");
    }
  }

  //not use methods
  static async deleteSpace(query: any, data: any, tenant?: any) {
    let message = null;
    try {
      const idQuery = Array.isArray(query._id) ? { $in: query._id } : query._id;
      const [spaceData] = await SpaceRepo.getPaginatedSpaces({ query: { _id: idQuery }, skip: 0, limit: 1, user_id: null });
      const dateSubmitted = new Date().toISOString();
      const date_submitted = formatDate(dateSubmitted);

      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Space Deletion Requested`,
        email_data: {
          verification_link: `${VENUE_4_USE_URI}/sg/login/admin`,
          space_name: spaceData?.name?.replace(/_/g, " ") || "",
          owner_first_name: spaceData?.venue?.user?.first_name?.replace(/_/g, " ") || "",
          owner_last_name: spaceData?.venue?.user?.last_name?.replace(/_/g, " ") || "",
          location: spaceData?.venue?.address?.country?.replace(/_/g, " ") || "",
          request_date: date_submitted,
          email: SUPPORT_EMAIL,
        },
        cc: CC_SUPPORT_EMAIL,
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      message = `Email sent successfully to: ${SUPPORT_EMAIL}`;

      const result = await SpaceRepo.updateSpaces(data, query);

      return {
        result,
        message,
      };
    } catch (error) {
      throw new Error("Failed to delete space");
    }
  }

  static async getCoordinates(query: any) {
    const spaceQuery: any = {};

    if (query.country) {
      spaceQuery["venue.address.country"] = query.country;
    }

    if (query.space_id) {
      spaceQuery._id = new ObjectId(query.space_id as string);
    }

    return await SpaceRepo.getCoordinates(spaceQuery);
  }
}

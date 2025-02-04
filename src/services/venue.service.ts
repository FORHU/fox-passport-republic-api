import { ObjectId } from "mongodb";

import { CC_SUPPORT_EMAIL, SUPPORT_EMAIL, VENUE_4_USE_URI } from "../config";
import { formatDate } from "../models/enquiries.model";
import { space_status } from "../models/space.model";
import { TVenue, venue_status } from "../models/venue.models";
import EmailLogsRepo from "../repositories/email_logs.repository";
import SpaceRepository from "../repositories/space.repository";
import VenueRepo from "../repositories/venue.repository";
import { USER_ROLES } from "../utils/constant";
import { hashSearch, sendTemplatedEmail } from "../utils/helpers";
import { logger } from "../utils/logger";
import { parseQuestion } from "../utils/question/utils";
import RedisUtil from "../utils/redis.util";
import { constructVenueQuery } from "../utils/venue/helper";
import AdminSvc from "./admin.service";
import CancellationPolicySvc from "./cancellation-policy.service";
import CountrySettingSvc from "./country-setting.service";
import KeywordSvc from "./keyword.service";
import QuestionSvc from "./questions.service";
import SaleTransactionSvc from "./sale-transactions.service";
import SpaceSvc from "./space.service";

const PREFIX = "venues";

export default class VenueSvc {
  static async createVenue(data: TVenue) {
    return VenueRepo.createVenue(data);
  }

  static async getVenue(query: any) {
    return VenueRepo.getVenues(query);
  }

  static async getPaginatedVenues(query: any, skip: number, limit: number) {
    return VenueRepo.getPaginatedVenues(query, skip, limit);
  }

  static async countVenues(query: any) {
    return VenueRepo.countVenues(query);
  }

  static async updateVenue(venueId: ObjectId, data: any, tenant?: any) {
    const [venueData] = await this.getPaginatedVenues({ _id: venueId }, 0, 1);
    const [spaceData] = await SpaceRepository.getPaginatedSpaces({ query: { "venue._id": venueId }, skip: 0, limit: 1, user_id: null });
    const emailLogData = await EmailLogsRepo.getOneEmailLog({
      user_id: venueData.user,
      email_type: "venue_for_approval",
      venue_id: venueId,
      status: "sent",
    });

    const dateSubmitted = new Date().toISOString();
    const date_submitted = formatDate(dateSubmitted);

    let message = null;
    let emailStatus = null;

    if (data.status && data.status === "FOR_APPROVAL" && !emailLogData) {
      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Venue For Approval`,
        email_data: {
          email: venueData?.user?.email,
          first_name: venueData?.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
          venue_name: venueData?.name?.replace(/_/g, " ") || " ",
          date_submitted: date_submitted?.replace(/_/g, " "),
        },
        template_name: "venue-for-approval.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Venue Approval Needed`,
        email_data: {
          verification_link: `${VENUE_4_USE_URI}/sg/login/admin`,
          first_name: venueData?.user?.first_name?.replace(/_/g, " ") || "Venue",
          last_name: venueData?.user?.last_name?.replace(/_/g, " ") || "Owner",
          phone_number: venueData?.user?.phone_number?.replace(/_/g, " ") || " ",
          owner_email: venueData?.user?.email || " ",
          venue_name: venueData?.name?.replace(/_/g, " ") || " ",
          street: venueData?.address?.street?.replace(/_/g, " ") || " ",
          city: venueData?.address?.city?.replace(/_/g, " ") || " ",
          postal_code: venueData?.address?.postal_code?.replace(/_/g, " ") || " ",
          country: venueData?.address?.country?.replace(/_/g, " ") || " ",
          venue_description: venueData?.description?.replace(/_/g, " ") || " ",
          space_name: spaceData?.name?.replace(/_/g, " ") || " ",
          space_type: spaceData?.type?.replace(/_/g, " ") || " ",
          representation: spaceData?.representation?.replace(/_/g, " ") || " ",
          date_submitted: date_submitted?.replace(/_/g, " ") || " ",
          email: SUPPORT_EMAIL,
        },
        cc: CC_SUPPORT_EMAIL,
        isAdmin: true,
        template_name: "approval-notification.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      emailStatus = "sent";
      message = `Email sent successfully to: ${venueData.user.email}`;

      logger.log({
        level: "info",
        message: ` Emails sent to  ${venueData.user.email}.`,
      });
    } else {
      emailStatus = "failed";
      message = `Failed to send email to  ${venueData.user.email}`;

      logger.log({
        level: "warn",
        message: `Missing email details`,
      });
    }

    if (!emailLogData) {
      const email_logs_data = {
        _id: new ObjectId(),
        user_id: venueData.user._id,
        venue_id: venueId,
        email_type: "venue_for_approval",
        status: emailStatus,
        sentAt: new Date(),
        createdAt: new Date(),
      };
      await EmailLogsRepo.createEmailLog(email_logs_data);
    }

    const result = await VenueRepo.updateVenue(venueId, data);

    return {
      result,
      message,
    };
  }

  static async handleUpdateVenue(venue_id: ObjectId, data: any) {
    return await VenueRepo.updateVenue(venue_id, data);
  }

  static async deleteVenues(venueIds: ObjectId[]) {
    await SpaceRepository.deleteSpaces({ venue: { $in: venueIds } });
    return VenueRepo.deleteVenues(venueIds);
  }

  static async getVenuesByIds(venueIds: ObjectId[]) {
    const query = { _id: { $in: venueIds } };
    return VenueRepo.getVenues(query);
  }

  static async getVenueNameIdAndStatus(query?: any) {
    const project = { name: 1, _id: 1, status: 1 };
    let list = null;
    const hashList = hashSearch({ query, project, description: "getVenueNameIdAndStatus" });
    const cacheList = await RedisUtil.getCache(hashList, PREFIX);
    if (!cacheList) {
      list = await VenueRepo.getVenues(query, project);
      await RedisUtil.saveCache({ key: hashList, data: JSON.stringify(list), prefix: PREFIX });
    } else {
      list = JSON.parse(cacheList);
    }

    return list;
  }
  static async getVenueDetails(query: any) {
    const project = { name: 1, _id: 1 };

    let list = null;
    const hashList = hashSearch({ query, project, description: "getVenueDetails" });
    const cacheList = await RedisUtil.getCache(hashList, PREFIX);
    if (!cacheList) {
      list = await VenueRepo.getVenues(query, project);
      await RedisUtil.saveCache({ key: hashList, data: JSON.stringify(list), prefix: PREFIX });
    } else {
      list = JSON.parse(cacheList);
    }

    return list;
  }

  static async deleteVenue(venueId: ObjectId, data: any, venueData?: any) {
    let message = null;
    try {
      const dateSubmitted = new Date().toISOString();
      const date_submitted = formatDate(dateSubmitted);

      sendTemplatedEmail({
        subject: "Venue4Use: Venue Deletion Requested",
        email_data: {
          verification_link: `${VENUE_4_USE_URI}/sg/login/admin`,
          venue_name: venueData?.name?.replace(/_/g, " ") || "",
          owner_first_name: venueData?.user?.first_name?.replace(/_/g, " ") || "",
          owner_last_name: venueData?.user?.last_name?.replace(/_/g, " ") || "",
          location: venueData?.address?.country?.replace(/_/g, " ") || "",
          request_date: date_submitted,
          email: SUPPORT_EMAIL,
        },
        cc: CC_SUPPORT_EMAIL,
        template_name: "venue-deletion-request.html",
      });

      message = `Email sent successfully to: ${SUPPORT_EMAIL}`;

      const result = await VenueRepo.deleteVenue(venueId, data);

      return {
        result,
        message,
      };
    } catch (error) {
      console.error("Failed to process venue deletion or send email:", error);
      throw new Error("Failed to delete venue or send email");
    }
  }
  static async processVenueCreation(user: any, payload: any) {
    const { name, keywords, description, representation, form_steps = 1, status = venue_status.DRAFT, payment_method, tenant } = payload;

    const country = user?.country || "SG";
    const user_role = user?.role;
    const [country_settings] = await CountrySettingSvc.getCountrySetting({ cca2: country });

    const venue_name = await this.getVenueNameIdAndStatus({ name: name });
    if (venue_name.length > 0) throw new Error("Venue name already exists");

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
      newKeywords = await KeywordSvc.handleParsingKeywords(keywords);
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
    return VenueRepo.createVenue(venueData);
  }

  static async processVenueUpdate(payload: any, user: any, venue_id: ObjectId, venue: TVenue, tenant?: any) {
    const {
      name,
      representation,
      description,
      address,
      foods_and_beverages,
      venue_details,
      keywords,
      cancellation_policy,
      form_steps,
      status,
      age_restriction,
      commission,
      rebate,
      payment_method,
    } = payload;

    const userRole = user.role;
    let venueSubscription = venue.payment_method;

    if (venueSubscription === null || userRole === "ADMIN") {
      venueSubscription = payment_method;
    }

    if (userRole !== "ADMIN" && [venue_status.REQUIRES_CONSENT, venue_status.PENDING].includes(status)) {
      throw new Error("Only ADMIN can set the status to PENDING or REQUIRES_CONSENT.");
    }

    venue.keywords = !keywords || keywords.length < 0 ? venue.keywords : keywords;

    let keywordsIds = venue.keywords.map((item: any) => item._id);
    if (keywords) {
      keywordsIds = await KeywordSvc.handleParsingKeywords(venue.keywords);
    }
    const updateQuestionData = async (data: any, existingData: any[]) => {
      if (data) {
        if (existingData && existingData.length > 0) {
          const objectIds = existingData.map((id: any) => new ObjectId(id));
          await QuestionSvc.deleteQuestions(objectIds);
        }

        const parsedData = parseQuestion(data, venue_id, "VENUE");
        const result = await QuestionSvc.createQuestions(parsedData);
        const upsertedIds = result.upsertedIds;

        // eslint-disable-next-line no-unused-vars
        return Object.entries(upsertedIds).map(([key, value]) => new ObjectId(value));
      }
    };

    let foodsAndBeveragesIds = venue.foods_and_beverages;
    if (foods_and_beverages) {
      foodsAndBeveragesIds = await updateQuestionData(foods_and_beverages, venue.foods_and_beverages);
    }

    let venueDetailsIds = venue.venue_details;
    if (venue_details) {
      venueDetailsIds = await updateQuestionData(venue_details, venue.venue_details);
    }

    let cancellationPolicyId = venue?.cancellation_policy;

    if (cancellation_policy) {
      const cancellationPolicyPayload = {
        venue_id: new ObjectId(venue_id),
        ...cancellation_policy,
      };
      if (cancellationPolicyId) {
        cancellationPolicyPayload._id = cancellationPolicyId;
      }

      cancellationPolicyId = await CancellationPolicySvc.createOrUpdateCancellationPolicy(cancellationPolicyPayload);
    }

    if (status && [venue_status.OWNER_DECLINED, venue_status.OWNER_REQUEST_DELETION].includes(status)) {
      await SpaceSvc.updateSpaces(
        {
          status: status === venue_status.OWNER_DECLINED ? space_status.OWNER_DECLINED : space_status.OWNER_REQUEST_DELETION,
        },
        { venue: venue_id, status: space_status.REQUIRES_CONSENT },
      );

      await SpaceSvc.deleteSpaces({ venue: venue_id, status: space_status.PENDING });

      const transactionStatus = status === venue_status.OWNER_DECLINED ? "owner_declined" : "owner_request_deletion";

      await SaleTransactionSvc.updateSaleTransaction(
        { venue: venue_id },
        { status: transactionStatus, remarks: transactionStatus, updatedAt: new Date() },
      );

      // const adminMember = await AdminMembersRepo.getAdminMember({ invited_user: salesTransactions.user });
      // if (adminMember) {
      //   await AdminMembersRepo.pullVenue(adminMember._id, venue_id);
      // }
    }

    let commissionValue = commission;
    if (payment_method === "SUBSCRIPTION") {
      commissionValue = 0;
    }

    const venueUpdateData = {
      ...(commissionValue && { commission: commissionValue }),
      ...(rebate && { rebate }),
      ...(status && { status }),
      ...(form_steps && { form_steps }),
      ...(name && { name }),
      ...(representation && { representation }),
      ...(description && { description }),
      ...(address && { address }),
      ...(keywords && { keywords: keywordsIds }),
      ...(foods_and_beverages && { foods_and_beverages: foodsAndBeveragesIds }),
      ...(venue_details && { venue_details: venueDetailsIds }),
      ...(cancellation_policy && { cancellation_policy: cancellationPolicyId }),
      ...(age_restriction && { age_restriction }),
      ...(payment_method && { payment_method: venueSubscription }),
    };

    // Update venue outside of the conditional block to ensure it's always called
    return await this.updateVenue(venue_id, venueUpdateData, tenant);
  }

  static async processCountAdminVenues(params: any, user: any) {
    const { excluded_status, tenant_code } = params;
    const query: any = {};

    if ([USER_ROLES.VENUE_LISTER, USER_ROLES.VENUE_OWNER].includes(user.role)) {
      query["organization"] = user.organization;
    }

    if (excluded_status) {
      const status = excluded_status as string;
      const excludedStatuses = status.split(",");
      if (excludedStatuses.length > 0) {
        query.status = { $nin: excludedStatuses };
      }
    }

    if (tenant_code) {
      query["tenant"] = tenant_code;
    }

    query["deletedAt"] = { $eq: null };

    let result = null;
    const hashList = hashSearch({ query, description: "processCountAdminVenues" });
    const cacheList = await RedisUtil.getCache(hashList, PREFIX);
    if (!cacheList) {
      result = await AdminSvc.countAdminVenue(query);
      await RedisUtil.saveCache({ key: hashList, data: JSON.stringify(result), prefix: PREFIX });
    } else {
      result = JSON.parse(cacheList);
    }

    return result;
  }

  static async processedVenuePagination(params: any, user: any, venues: any) {
    const { page = 1, limit = 20 } = params as any;

    const query = constructVenueQuery(params, user, venues);

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
    if (!cacheList) {
      list = await VenueRepo.getPaginatedVenues(query, offset, limitNumber);
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

  static async handleCountVenues(query: any) {
    return VenueRepo.countVenues(query);
  }

  static async handleGetVenues(query: any, limit: number, offset: number) {
    return VenueRepo.handleGetVenues(query, limit, offset);
  }
}

/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { CC_SUPPORT_EMAIL } from "../config";
import { OrgRoles, StatusType } from "../models/organization-member.model";
import { SaleTransactionsStatus } from "../models/sale-transactions.model";
import { space_status } from "../models/space.model";
import { hashPassword, user_role, user_status } from "../models/user.model";
import { venue_status } from "../models/venue.models";
import AdminRepo from "../repositories/admin.repository";
import EmailLogsRepo from "../repositories/email_logs.repository";
import EnquiryRepo from "../repositories/enquiries.repository";
import SpaceRepository from "../repositories/space.repository";
import VenueRepo from "../repositories/venue.repository";
import KeywordSvc from "../services/keyword.service";
import OrganizationSvc from "../services/organization.service";
import OrganizationMemberSvc from "../services/organization-member.service";
import SpaceSvc from "../services/space.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { PaginationType, TransferOwnershipPayload } from "../types/common";
import { generateVerificationToken } from "../utils/auth";
import { SUPPORTED_CURRENCIES } from "../utils/constant";
import { convertCentsToDollars, convertDollarsToCents, convertToCurrency, formatDate, hashSearch, sendTemplatedEmail } from "../utils/helpers";
import RedisUtil from "../utils/redis.util";
import { createPrice, createProduction } from "../utils/stripe";
import SaleTransactionSvc from "./sale-transactions.service";
import StripeProductSvc from "./stripe-product.service";
import UserRolesSvc from "./user-roles.service";

const PREFIX_VENUE = "venues";
const PREFIX_SPACE = "spaces";

export default class AdminSvc {
  static async getSpaces(query: any) {
    try {
      return AdminRepo.getSpaces(query);
    } catch (error) {
      throw error;
    }
  }

  static async updateVenue(data: any, status: string, tenant?: any) {
    try {
      const [venue_data] = await AdminRepo.getSpaces({ venue: data });

      if (!venue_data) {
        throw new Error("No venue data found.");
      }

      if (["FOR_APPROVAL", "PUBLISHED"].includes(status)) {
        return await AdminRepo.updateVenue(data, status);
      }

      const newDate = new Date();
      const dateSubmitted = newDate.toISOString();
      const date_approved = formatDate(dateSubmitted);
      const date_submitted = formatDate(venue_data.updatedAt);

      let emailStatus = null;

      if ([venue_status.PUBLISHED, venue_status.REJECTED, venue_status.SUSPENDED].includes(status as venue_status)) {
        const subject =
          status === venue_status.PUBLISHED
            ? `${tenant?.config?.name}: Venue Approved`
            : status === venue_status.REJECTED
              ? `${tenant?.config?.name} Venue Submission Status`
              : `${tenant?.config?.name} Venue Suspension Notice`;

        const template_name =
          status === venue_status.PUBLISHED
            ? "venue-approved.html"
            : status === venue_status.REJECTED
              ? "venue-declined.html"
              : "venue-suspension.html";

        const email_type = subject;

        try {
          sendTemplatedEmail({
            subject,
            email_data: {
              email: venue_data.venue.user.email,
              first_name: venue_data?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
              venue_name: venue_data?.venue?.name?.replace(/_/g, " ") || "",
              space_name: venue_data?.name?.replace(/_/g, " ") || "",
              date_submitted: date_submitted.replace(/_/g, " "),
              date_approved: date_approved.replace(/_/g, " "),
            },
            template_name,
            support_email: tenant?.config?.support_email,
            email_credentials: tenant?.config?.email_credentials,
            tenant: tenant?.config?.name,
          });
          emailStatus = "sent";
        } catch (err) {
          console.error("Failed to send email:", err);
          emailStatus = "failed";
          throw new Error("Failed to send email.");
        }

        const emailLogData = await EmailLogsRepo.getOneEmailLog({
          email_type,
          venue_id: data,
          status: "sent",
        });

        if (!emailLogData) {
          const email_logs_data = {
            _id: new ObjectId(),
            user_id: venue_data.venue.user._id,
            venue_id: data,
            email_type,
            status: emailStatus,
            sentAt: new Date(),
            createdAt: new Date(),
          };
          await EmailLogsRepo.createEmailLog(email_logs_data);
        }

        return `Email sent successfully to: ${venue_data.venue.user.email}`;
      }

      const result = await AdminRepo.updateVenue(data, status);
      return result;
    } catch (error) {
      console.error("Error in updateVenue:", error);
      throw error;
    }
  }

  static async getAllVenues(payload: any) {
    try {
      const { status, venue_name, venues, page = 1, limit = 20, tenant_code } = payload;

      const query: any = {};

      if (tenant_code) {
        query["tenant"] = tenant_code;
      }

      if (status) {
        if (!status.includes("ALL")) {
          query.status = { $in: status };
        }
      }

      if (typeof venue_name === "string") {
        const words = venue_name
          .split(" ")
          .map((word: string) => word.trim())
          .filter(Boolean);

        const regexPattern = new RegExp(words.map((word: string) => `(?=.*${word})`).join(""), "i");

        query.$or = [{ name: { $regex: regexPattern } }, { spaces: { $elemMatch: { name: { $regex: regexPattern } } } }];
      }

      if (venues !== "ALL") {
        const venueIds = venues.map((venue: string) => new ObjectId(venue));
        query._id = { $in: venueIds };
      }

      const pageNumber = parseInt(page as string);
      const limitNumber = parseInt(limit as string);
      const offset = (pageNumber - 1) * limitNumber;

      const additionQuery = {
        limit: limitNumber,
        offset,
        ...query,
      };

      let list_count = null;
      const hashSpaceCount = hashSearch({ additionQuery, count: true });
      const cacheSpaceCount = await RedisUtil.getCache(hashSpaceCount, PREFIX_VENUE);

      if (!cacheSpaceCount) {
        list_count = await VenueRepo.countVenues(query);
        await RedisUtil.saveCache({ key: hashSpaceCount, data: list_count, prefix: PREFIX_VENUE });
      } else {
        list_count = Number(cacheSpaceCount);
      }

      let list = null;
      const hashSpaceList = hashSearch(additionQuery);
      const cacheSpaceList = await RedisUtil.getCache(hashSpaceList, PREFIX_VENUE);

      if (!cacheSpaceList) {
        list = await VenueRepo.getPaginatedVenues(query, offset, limitNumber);
        await RedisUtil.saveCache({ key: hashSpaceList, data: JSON.stringify(list), prefix: PREFIX_VENUE });
      } else {
        list = JSON.parse(cacheSpaceList);
      }

      return {
        data: list,
        total_pages: Math.ceil(list_count / limitNumber) || 0,
        total_items: list_count,
        current_page: page,
        size: limitNumber,
        offset,
      };
    } catch (error) {
      throw error;
    }
  }

  static async updateSpace(query: any, data: any, tenant?: any) {
    try {
      const [space_data] = await SpaceRepository.getPaginatedSpaces({ query: query, skip: 0, limit: 1, user_id: null });

      let emailMessage = "";

      if (space_data) {
        const newDate = new Date();
        const dateSubmitted = newDate.toISOString();
        const date_approved = formatDate(dateSubmitted);
        const date_submitted = formatDate(space_data.updatedAt);

        if ([space_status.PUBLISHED, space_status.REJECTED, space_status.DELETED, space_status.SUSPENDED].includes(data.status)) {
          const subject =
            data.status === space_status.PUBLISHED
              ? `${tenant?.config?.name}: Space Approved`
              : data.status === space_status.REJECTED
                ? `${tenant?.config?.name}: Space Submission Status`
                : data.status === space_status.DELETED
                  ? `${tenant?.config?.name}: Space Submission Status`
                  : `${tenant?.config?.name}: Space Suspension Notice`;

          const template_name =
            data.status === space_status.PUBLISHED
              ? "space-approved.html"
              : data.status === space_status.REJECTED
                ? "space-declined.html"
                : data.status === space_status.DELETED
                  ? "space-declined.html"
                  : "space-suspension.html";

          sendTemplatedEmail({
            subject,
            email_data: {
              email: space_data.venue.user.email,
              first_name: space_data?.venue.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
              venue_name: space_data?.venue.name?.replace(/_/g, " ") || "",
              space_name: space_data?.name?.replace(/_/g, " ") || "",
              date_submitted: date_submitted.replace(/_/g, " "),
              date_approved: date_approved.replace(/_/g, " "),
            },
            template_name,
            support_email: tenant?.config?.support_email,
            email_credentials: tenant?.config?.email_credentials,
            tenant: tenant?.config?.name,
          });

          emailMessage = `Email sent successfully to: ${space_data.venue.user.email}`;
        }
      } else {
        throw new Error("No space data found.");
      }
      const result = await AdminRepo.updateSpace(query, data);

      return {
        result,
        message: emailMessage,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getAllSpaces(query: any, pageNumber: number, limitNumber: number) {
    try {
      return AdminRepo.getAllSpaces(query, pageNumber, limitNumber);
    } catch (error) {
      throw error;
    }
  }

  static async countAdminSpace(query?: any) {
    try {
      let list = null;
      const hashCountAdminSpace = hashSearch({ query, description: "countAdminSpace" });
      const cacheCountAdminSpace = await RedisUtil.getCache(hashCountAdminSpace, PREFIX_SPACE);
      if (!cacheCountAdminSpace) {
        list = await AdminRepo.countAdminSpace(query);
        await RedisUtil.saveCache({ key: hashCountAdminSpace, data: JSON.stringify(list), prefix: PREFIX_SPACE });
      } else {
        list = JSON.parse(cacheCountAdminSpace);
      }
      return list;
    } catch (error) {
      throw error;
    }
  }

  static async countAdminVenue(query?: any) {
    try {
      let list = null;
      const hashCountAdminVenue = hashSearch({ query, description: "countAdminVenue" });
      const cacheCountAdminVenue = await RedisUtil.getCache(hashCountAdminVenue, PREFIX_VENUE);
      if (!cacheCountAdminVenue) {
        list = await AdminRepo.countAdminVenue(query);
        await RedisUtil.saveCache({ key: hashCountAdminVenue, data: JSON.stringify(list), prefix: PREFIX_VENUE });
      } else {
        list = JSON.parse(cacheCountAdminVenue);
      }

      return list;
    } catch (error) {
      throw error;
    }
  }

  static async deleteVenue(query: any, updateData: any, spaceData?: any[], tenant?: any) {
    let message = null;
    try {
      const dateSubmitted = new Date().toISOString();
      const date_submitted = formatDate(dateSubmitted);
      const space = spaceData[0];
      const emailRecipient = space.venue.user.email;
      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Venue Deletion Approved`,
        email_data: {
          venue_name: space?.venue?.name?.replace(/_/g, " ") || "",
          first_name: space?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
          date_deleted: date_submitted || "",
          email: emailRecipient,
        },
        cc: CC_SUPPORT_EMAIL,
        template_name: "admin-venue-deletion-approval.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      message = `Email sent successfully to: ${emailRecipient}`;

      const result = await AdminRepo.deleteVenue(query, updateData);

      return {
        result,
        message,
      };
    } catch (error) {
      throw error;
    }
  }

  static async deleteSpace(query: any, updateData: any, tenant?: any) {
    try {
      const idQuery = Array.isArray(query._id) ? { $in: query._id } : query._id;
      const spaces_data = await SpaceRepository.getPaginatedSpaces({
        query: { _id: idQuery },
        skip: 0,
        limit: Array.isArray(query._id) ? query._id.length : 1,
        user_id: null,
      });

      if (spaces_data.length === 0) {
        throw new Error("No spaces found");
      }

      const emailRecipient = spaces_data[0].venue.user.email;
      const first_name = spaces_data[0]?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue Owner";

      const newDate = new Date();
      const dateDeleted = newDate.toISOString();
      const date_deleted = formatDate(dateDeleted);

      const spaceNames = spaces_data.map((space) => space.name?.replace(/_/g, " ") || "").join(", ");

      sendTemplatedEmail({
        subject: `${tenant?.config?.name}: Space Deletion Approved`,
        email_data: {
          email: emailRecipient,
          first_name: first_name,
          space_name: spaceNames,
          date_deleted: date_deleted,
        },
        cc: CC_SUPPORT_EMAIL,
        template_name: "admin-space-deletion-approval.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      const result = await AdminRepo.deleteSpace(query, updateData);

      return {
        message: `Email sent successfully to ${emailRecipient}`,
        result,
      };
    } catch (error) {
      console.error("Error deleting space or sending email:", error);
      throw new Error("An error occurred while deleting the space(s) or sending the email.");
    }
  }

  static async getEnquiries(query: any, pageNumber: number, limitNumber: number) {
    try {
      return await EnquiryRepo.getEnquiries(query, pageNumber, limitNumber);
    } catch (error) {
      throw error;
    }
  }

  static async updateAssociatedSpaces(query: any, data: any, tenant?: any) {
    const spacesDetails = await AdminSvc.getSpaces(query);

    for (const space of spacesDetails) {
      const user = await UserSvc.getUser({ _id: space.venue.user });
      if (user) {
        const date_submitted = formatDate(space.updatedAt);
        const subject =
          data.status === space_status.SUSPENDED
            ? `${tenant?.config?.name} Space Suspension Notice`
            : `${tenant?.config?.name} Space Submission Status`;
        const template_name = data.status === space_status.SUSPENDED ? "space-suspension.html" : "space-declined.html";
        sendTemplatedEmail({
          subject,
          email_data: {
            email: space?.venue?.user?.email,
            first_name: space?.venue?.user?.first_name?.replace(/_/g, " ") || "Venue Owner",
            venue_name: space?.venue?.name?.replace(/_/g, " ") || "",
            space_name: space?.name?.replace(/_/g, " ") || "",
            date_submitted: date_submitted.replace(/_/g, " "),
          },
          template_name,
          support_email: tenant?.config?.support_email,
          email_credentials: tenant?.config?.email_credentials,
          tenant: tenant?.config?.name,
        });
      }
    }

    return AdminRepo.updateSpace(query, data);
  }

  static async patchVenueKeywords(count: number, query: any, tenant?: any) {
    let page = 1;
    const limit = 1;
    while ((page - 1) * limit < count) {
      const offset = (page - 1) * limit;
      const [venue] = await VenueSvc.getPaginatedVenues(query, offset, limit);
      if (venue.keywords.length === 0 || !venue.keywords) await this.randomizeKeywordsInSpaceVenue(venue._id, "VENUE", tenant);
      const keywordIds = await KeywordSvc.handleParsingKeywords(venue.keywords);
      await VenueSvc.updateVenue(venue._id, { keywords: keywordIds }, tenant);
      console.log("VENUE_KEYWORD_UPDATED", venue._id);
      page++;
    }
  }

  static async patchSpaceKeywords(count: number, query: any, tenant?: any) {
    let page = 1;
    const limit = 1;
    while ((page - 1) * limit < count) {
      const skip = (page - 1) * limit;
      const [space] = await SpaceSvc.getSpaceKeywords({ query, skip, limit } as PaginationType);
      if (space.keywords.length === 0 || !space.keywords) await this.randomizeKeywordsInSpaceVenue(space._id, "SPACE", tenant);
      const keywordIds = await KeywordSvc.handleParsingKeywords(space.keywords);
      await SpaceSvc.updateSpaces({ keywords: keywordIds }, { _id: space._id });
      console.log("SPACE_KEYWORD_UPDATED", space._id);
      page++;
    }
  }

  static async randomizeKeywordsInSpaceVenue(_id: ObjectId, identifier: string, tenant?: any) {
    const keyword_lists = await KeywordSvc.getKeywords({ type: "SPACE" }, 0, 100);
    const keywordIds = keyword_lists.map((item) => item._id);
    const randomCount = Math.floor(Math.random() * 8) + 1;
    const randomKeywordIds = this.getRandomKeywordIds(keywordIds, randomCount);

    if (identifier === "SPACE") return await SpaceSvc.updateSpaces({ keywords: randomKeywordIds }, { _id: _id });
    if (identifier === "VENUE") return await VenueSvc.updateVenue(_id, { keywords: randomKeywordIds }, tenant);
  }

  static getRandomKeywordIds(ids, count) {
    const shuffled = [...ids].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  static async transferOwnershipInvite(payload: TransferOwnershipPayload, tenant: any) {
    const { email, role, status, country, venue_id, current_user } = payload;

    const existingUser = await UserSvc.getUser({ email });
    let user: any;

    if (!existingUser) {
      user = await UserSvc.createUser({ email, role, status, country, organization: new ObjectId() });
    } else if (existingUser?.role !== user_role.VENUE_OWNER) {
      throw new Error("EXISTING_USER_SHOULD_BE_VENUE_OWNER");
    }

    const isExisting = Boolean(existingUser);

    await Promise.allSettled([
      VenueSvc.handleUpdateVenue(venue_id, {
        status: venue_status.REQUEST_TRANSFER_SENT,
        user: existingUser ? existingUser._id : user._id,
      }),
      SaleTransactionSvc.createSaleTransaction({
        user: current_user,
        status: SaleTransactionsStatus.SENT_REQUEST_TRANSFER_OWNERSHIP,
        venue_owner: existingUser ? existingUser._id : user._id,
        venue: venue_id,
        remarks: SaleTransactionsStatus.SENT_REQUEST_TRANSFER_OWNERSHIP,
      }),
    ]);

    // Send venue owner transfer invitation
    return this.sendVenueOwnerTransfer(existingUser || user, payload, isExisting, tenant);
  }

  static async sendVenueOwnerTransfer(user: any, payload: TransferOwnershipPayload, isExisting: boolean = false, tenant?: any) {
    const token = generateVerificationToken(
      {
        _id: user?._id,
        email: user.email,
        role: user.role,
        country: user.country,
        venue_id: payload.venue_id,
        venue_name: payload.venue_name,
        organization: user.organization,
      },
      "3d",
    );

    const verification_link = !isExisting
      ? `${tenant?.config.site_url}/signup/complete-profile/${token}?email=${payload?.email}&transfer_request=true`
      : `${tenant?.config.site_url}/callback/venue/transfer-ownership/${token}?email=${payload.email}&transfer_request=true`;

    sendTemplatedEmail({
      subject: `${tenant?.config?.name}: Admin Invitation`,
      email_data: {
        verification_link,
        email: payload.email,
        venue_name: payload.venue_name,
      },
      template_name: "request-venue-transfer-owner.html",
      support_email: tenant?.config?.support_email,
      email_credentials: tenant?.config?.email_credentials,
      tenant: tenant?.config?.name,
    });

    return { token };
  }

  static async handleOwnerTransfership(payload: any, tenant?: any) {
    /**
     *  1. Update User
     *  2. Update Venue
     *  3. Create venue team member
     *  4. Create Organization
     */
    const { user_id, venue_id, first_name, last_name, phone_number, password, organization_id } = payload;
    const hashedPassword = hashPassword(password);
    const userId = new ObjectId(user_id as string);
    const organizationId = new ObjectId(organization_id as string);
    const venueId = new ObjectId(venue_id as string);
    const associatedSpace = await SpaceSvc.getSpace({ venue: venueId });
    const existingUserRole = await UserRolesSvc.getUserRoles({ user: userId });
    const [venue] = await VenueSvc.getVenue({ _id: venueId });
    const newDate = new Date();
    const userRoleId = existingUserRole ? existingUserRole._id : new ObjectId();

    if (!existingUserRole) {
      await UserRolesSvc.createUserRoles({
        _id: userRoleId,
        user: userId,
        role: user_role.VENUE_OWNER,
        password: password,
        status: user_status.ACTIVE,
        organization: organizationId,
        createdAt: newDate,
        updatedAt: newDate,
      });
    }

    // Create organization and update user first
    await Promise.allSettled([
      UserSvc.updateUser(
        { _id: userId },
        {
          first_name,
          last_name,
          password: hashedPassword,
          status: user_status.ACTIVE,
          phone_number,
          organization: organizationId,
          user_roles: [userRoleId],
          updatedAt: newDate,
          tenant: tenant.code,
        },
      ),
      OrganizationSvc.createOrganization({
        _id: organizationId,
        name: venue.name,
        createdAt: newDate,
      }),
      OrganizationMemberSvc.createOrganizationMember({
        organization: organizationId,
        assigned_roles: [OrgRoles.VENUE_OWNER],
        invited_user_id: userId,
        status: StatusType.ACCEPTED,
        all_venues: true,
        is_owner: true,
        createdAt: newDate,
      }),
      VenueSvc.updateVenue(
        venueId,
        {
          user: userId,
          organization: organizationId,
          status: venue_status.DRAFT,
          updatedAt: newDate,
          tenant: tenant.code,
        },
        tenant,
      ),
      SpaceSvc.updateSpaces({ status: space_status.DRAFT, updatedAt: new Date(), user: userId }, { venue: venueId }),
      SaleTransactionSvc.updateSaleTransaction(
        { venue: venueId, venue_owner: userId },
        {
          status: SaleTransactionsStatus.TRANSFERRED_OWNERSHIP,
          remarks: SaleTransactionsStatus.TRANSFERRED_OWNERSHIP,
          updatedAt: new Date(),
        },
      ),
    ]);
  }

  static async handleOwnerExistingTransfership(payload: any, tenant?: any) {
    /**
     *  1. Update User
     *  2. Update Venue
     *  3. Create venue team member
     *  4. Create Organization
     */
    const { user_id, venue_id, organization_id } = payload;

    const userId = new ObjectId(user_id as string);
    const organizationId = new ObjectId(organization_id as string);
    const venueId = new ObjectId(venue_id as string);

    const newDate = new Date();

    return await Promise.allSettled([
      VenueSvc.updateVenue(
        venueId,
        {
          user: userId,
          organization: organizationId,
          status: venue_status.DRAFT,
          updatedAt: newDate,
        },
        tenant,
      ),
      SpaceSvc.updateSpaces(
        { user: userId, status: space_status.DRAFT, updatedAt: newDate },
        { venue: venueId, status: space_status.REQUIRES_CONSENT },
      ),
      SpaceSvc.deleteSpaces({ venue: venueId, status: space_status.PENDING }),
      SaleTransactionSvc.updateSaleTransaction(
        { venue: venueId, venue_owner: userId },
        {
          status: SaleTransactionsStatus.TRANSFERRED_OWNERSHIP,
          remarks: SaleTransactionsStatus.TRANSFERRED_OWNERSHIP,
        },
      ),
    ]);
  }

  static async updateOrganizationMember() {
    const venueOwnerUsers = await UserSvc.getUsers({ role: "VENUE_OWNER" });

    await Promise.all(
      venueOwnerUsers.map(async (user: any) => {
        const [venue]: any = await VenueSvc.getVenue({ user: new ObjectId(user._id) });
        const organization = venue?.organization;
        const invited_user_id = new ObjectId(user._id);

        const existingOrganizationMember = await OrganizationMemberSvc.getOrganization({
          invited_user_id,
          organization,
        });

        if (!existingOrganizationMember) {
          const results: any = await OrganizationMemberSvc.createOrganizationMember({
            organization,
            invited_user_id,
            assigned_roles: [OrgRoles.VENUE_OWNER],
            status: StatusType.ACCEPTED,
            all_venues: true,
            is_owner: true,
          });
          return results?._id;
        }
      }),
    );
  }
  static async processProductCreation(payload: any) {
    const { name, description = "", currency = "SGD", recurring = "month", price, country } = payload;

    const { product } = await createProduction({
      name,
      description,
      currency,
      recurring,
      price: convertDollarsToCents(price),
    });

    const prices: any[] = await Promise.all(
      SUPPORTED_CURRENCIES.map(async (_currency) => {
        const convertedPrice: number = convertToCurrency(convertDollarsToCents(price), currency, _currency);
        const stripe_price = await createPrice({
          unit_amount: convertedPrice,
          product_id: product.id,
          currency: _currency,
        });
        return {
          price_id: stripe_price.id,
          amount: convertCentsToDollars(stripe_price.unit_amount),
          currency: _currency,
          livemode: stripe_price.livemode,
          type: stripe_price.type,
          interval: stripe_price.recurring.interval,
          active: stripe_price.active,
        };
      }),
    );

    const result = await StripeProductSvc.createProduct({
      product_name: product.name,
      product_id: product.id,
      status: "ACTIVE",
      description: product.description,
      tenant: country,
      prices,
    });

    return result;
  }

  static async processSpaceDeletion({ venue_id, user_id, space_id }: { venue_id: ObjectId; user_id: ObjectId; space_id: ObjectId }, tenant?: any) {
    const data = { status: space_status.DELETED, deletedAt: new Date(), deletedBy: user_id };

    const [emailLogForApproval, emailLogPublished, [associatedVenue]] = await Promise.all([
      EmailLogsRepo.getOneEmailLog({ email_type: "venue_for_approval", venue_id, status: "sent" }),
      EmailLogsRepo.getOneEmailLog({
        email_type: { $in: ["[STAGING] Venue4Use: Venue Approved", "Venue4Use: Venue Approved"] },
        venue_id,
        status: "sent",
      }),
      VenueSvc.getVenue({ _id: venue_id, status: venue_status.FOR_DELETION }),
    ]);

    let venueStatus: string | null = null;

    if (associatedVenue) {
      venueStatus = venue_status.DELETED;
    } else if (emailLogPublished) {
      venueStatus = venue_status.PUBLISHED;
    } else if (emailLogForApproval) {
      venueStatus = venue_status.FOR_APPROVAL;
    }

    if (venueStatus) await AdminSvc.updateVenue(venue_id, venueStatus);

    return AdminSvc.deleteSpace({ _id: space_id }, data, tenant);
  }
}

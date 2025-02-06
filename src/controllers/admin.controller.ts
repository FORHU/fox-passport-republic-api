import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import multer from "multer";
import xlsx from "xlsx";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import { space_status } from "../models/space.model";
import { user_role, user_status } from "../models/user.model";
import { venue_status } from "../models/venue.models";
import AdminSvc from "../services/admin.service";
import BookingSvc from "../services/booking.service";
import EnquirySvc from "../services/enquiries.service";
import FileSrvc from "../services/file.service";
import KeywordSvc from "../services/keyword.service";
import SpaceSvc from "../services/space.service";
import StripeProductSvc from "../services/stripe-product.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import RatingSvc from "../services/rating.service";
import { constructEnquiryQuery, parseWorkbook, validateSheetsData } from "../utils/admin/helpers";
import {
  validateGetSpaceSchema,
  validateGetVenueSchema,
  validateUpdateSpaceStatus,
  validateUpdateVenueStatus,
  validateVenueTransfer,
} from "../utils/admin/validation";
import { uploadFileToS3 } from "../utils/aws";
import { validateCreateProduct, validateGetEnquiriesSchema, validateGetRatingSchema } from "../utils/enquiries/validation";
import { calculatePagination } from "../utils/helpers";
import { initFileQueue } from "../utils/queues/files/file-migration.queue";
import { initQuestionQueue } from "../utils/queues/question/delete-question.queue";
import { initTenantUserQueue } from "../utils/queues/tenant/user.tenant.queue";
import { initTenantVenueQueue } from "../utils/queues/tenant/venue.tenant.queue";
import { initUserRolesQueue } from "../utils/queues/user/migrate-user.queue";
import { initAddVenueQueue } from "../utils/queues/venue/add-venue.queue";
import { validateUpdateRatingSchema } from "../utils/rating/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

const storage = multer.memoryStorage();
const upload = multer({ storage });

export default class AdminCtrl {
  static async updateVenue(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.venue_id);
      const { status } = req.body;
      const tenant = req?.tenant;

      const { error } = validateUpdateVenueStatus(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      if (["SUSPENDED", "REJECTED"].includes(status)) {
        const newStatus = status === "SUSPENDED" ? space_status.SUSPENDED : space_status.REJECTED;

        const associatedSpace = await AdminSvc.getSpaces({ venue: _id });
        const associatedSpaceIds = associatedSpace?.map((space: any) => space._id) || [];
        if (associatedSpaceIds.length === 0) {
          return handleErrorResponse(res, new Error("No associated spaces found for this venue"), { code: "NO_ASSOCIATED_SPACES" });
        }

        await AdminSvc.updateAssociatedSpaces({ _id: { $in: associatedSpaceIds } }, { status: newStatus, updatedAt: new Date() }, tenant);
      }

      const result = await AdminSvc.updateVenue(_id, status, req?.tenant);
      return handleResponse(res, result, "VENUE_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getAllVenues(req: Request, res: Response) {
    try {
      const { status } = req.query as any;
      if (status) {
        req.query.status = status.split(",");
      }

      const { error } = validateGetVenueSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      req.query["venues"] = req["venues"];
      if (req?.tenant) {
        req.query["tenant_code"] = req.tenant.code;
      }

      const result = await AdminSvc.getAllVenues(req.query);

      return handleResponse(res, result, "ALL_VENUES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateSpace(req: Request, res: Response) {
    try {
      const query = { _id: new ObjectId(req.params.space_id) };
      const { status } = req.body;

      const { error } = validateUpdateSpaceStatus(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const data = {
        status: status,
        updatedAt: new Date(),
      };

      const result = await AdminSvc.updateSpace(query, data, req?.tenant);
      return handleResponse(res, result, "SPACE_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getAllSpaces(req: Request, res: Response) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const query: any = {};

      const { error } = validateGetSpaceSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      if (status) {
        const statusStrings = status as string;
        const statusArray = statusStrings.split(",");
        if (!statusStrings.includes("ALL")) {
          query.status = { $in: statusArray };
        }
      }

      if (req["venues"] !== "ALL") {
        const venueIds = req["venues"].map((venue: string) => new ObjectId(venue));
        query["venue._id"] = { $in: venueIds };
      }

      if (req?.tenant) {
        query["venue.tenant"] = req?.tenant?.code;
      }

      const pageNumber = parseInt(page as string);
      const limitNumber = parseInt(limit as string);

      const result = await AdminSvc.getAllSpaces(query, pageNumber, limitNumber);
      return handleResponse(res, result, "ALL_SPACES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async countAdminSpace(req: Request, res: Response) {
    try {
      const query: any = {};

      if (req["venues"] !== "ALL") {
        const venueIds = req["venues"].map((venue: string) => new ObjectId(venue));
        query["venue._id"] = { $in: venueIds };
      }

      if (req.tenant) {
        query["venue.tenant"] = req.tenant.code;
      }

      const result = await AdminSvc.countAdminSpace(query);
      return handleResponse(res, result, "COUNT_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async countAdminVenue(req: Request, res: Response) {
    try {
      const { excluded_status } = req.query;
      const query: any = {};

      if (excluded_status) {
        const status = excluded_status as string;
        const excludedStatuses = status.split(",");
        if (excludedStatuses.length > 0) {
          query.status = { $nin: excludedStatuses };
        }
      }

      if (req["venues"] !== "ALL") {
        const venueIds = req["venues"].map((venue: string) => new ObjectId(venue));
        query._id = { $in: venueIds };
      }

      if (req.tenant) {
        query["tenant"] = req.tenant.code;
      }

      const result = await AdminSvc.countAdminVenue(query);
      return handleResponse(res, result, "COUNT_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async deleteVenue(req: Request, res: Response) {
    try {
      const user_id = new ObjectId(req.user._id as string);
      const venue_id = new ObjectId(req.params.venue_id);
      const query = {
        venue: venue_id,
        status: { $nin: ["HAPPENED", "CANCELLED", "COMMISSION_DUE", "ARCHIVED"] },
      };

      const existingEnquiries = await EnquirySvc.getEnquiry(query);
      if (existingEnquiries.length > 0) {
        return handleErrorResponse(res, {}, { code: "VENUE_CANNOT_BE_DELETED_WITH_PENDING_ENQUIRIES" });
      }

      const existingBookings = await BookingSvc.getAllBookings(query);
      if (existingBookings.length > 0) {
        return handleErrorResponse(res, {}, { code: "VENUE_CANNOT_BE_DELETED_WITH_PENDING_BOOKINGS" });
      }

      const existingSpace = await AdminSvc.getSpaces({ venue: venue_id });

      const updatedData = {
        status: "DELETED",
        deletedAt: new Date(),
        deletedBy: user_id,
      };

      const spaceIds = existingSpace.map((space: any) => space._id);

      await AdminSvc.deleteSpace({ _id: { $in: spaceIds } }, { status: "DELETED", deletedAt: new Date(), deletedBy: user_id }, req?.tenant);

      const result = await AdminSvc.deleteVenue(venue_id, updatedData, existingSpace, req?.tenant);
      return handleResponse(res, result, "VENUE_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async deleteSpace(req: Request, res: Response) {
    try {
      const user_id = new ObjectId(req.user._id as string);
      const space_id = new ObjectId(req.params.space_id);

      const [existingSpace] = await AdminSvc.getSpaces({ _id: space_id, status: "FOR_DELETION" });
      if (!existingSpace) {
        return handleErrorResponse(res, {}, { code: "SPACE_NOT_FOUND" });
      }

      const venue_id = existingSpace.venue._id;
      const query = { space: space_id, status: { $nin: ["HAPPENED", "CANCELLED", "COMMISSION_DUE", "ARCHIVED"] } };
      const [existingEnquiries, existingBookings] = await Promise.all([EnquirySvc.getEnquiry(query), BookingSvc.getAllBookings(query)]);

      if (existingEnquiries.length > 0) {
        return handleErrorResponse(res, {}, { code: "SPACE_CANNOT_BE_DELETED_WITH_PENDING_ENQUIRIES" });
      }
      if (existingBookings.length > 0) {
        return handleErrorResponse(res, {}, { code: "VENUE_CANNOT_BE_DELETED_WITH_PENDING_BOOKINGS" });
      }

      const result = await AdminSvc.processSpaceDeletion({ venue_id, user_id, space_id }, req?.tenant);

      return handleResponse(res, result, "SPACE_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getEnquries(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query as any;

      const pageNumber = parseInt(page.toString());
      const limitNumber = parseInt(limit.toString());
      const offset = (pageNumber - 1) * limitNumber;

      const { error } = validateGetEnquiriesSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const userData = await UserSvc.getUser({ _id: new ObjectId(req?.user?._id) });
      req.query["venues"] = req["venues"];
      if (req.tenant) {
        req.query["tenant_code"] = req.tenant.code;
      }
      const params = req.query;
      const query = constructEnquiryQuery(params);

      const formatResult = (data: any[], totalItems: number) => ({
        data,
        ...calculatePagination(totalItems, limitNumber, page, offset),
      });

      let data, totalItems;

      if (IS_ENQUIRY_MICROSERVICES) {
        const enquiryPayload = {
          space_id: query?.space_id,
          search_name: query?.search_name,
          event_type: query?.event_date,
          guests: query?.guests,
          event_date: query?.event_date,
          venue_id: query?.venue_id,
          enquiry_id: query?.enquiry_id,
          status: query?.status,
          togglePastCurrent: query?.toggle_current,
          user: userData,
          offset,
          limitNumber,
        };

        ({ enquiries: data, count: totalItems } = await EnquirySvc.getEnquiriesFromMicroservice(enquiryPayload));
      } else {
        [totalItems, data] = await Promise.all([EnquirySvc.getTotalCountEnquiry(query), EnquirySvc.getEnquiries(query, offset, limitNumber, true)]);
      }

      const result = formatResult(data, totalItems);
      return handleResponse(res, result, "ALL_ENQUIRIES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateOrganizationMember(req: Request, res: Response) {
    try {
      await AdminSvc.updateOrganizationMember();

      return handleResponse(res, {}, "PATCH_TEAM_MEMBER_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  //subscription

  static async createProduct(req: Request, res: Response) {
    try {
      const { name, description = "", currency = "SGD", recurring = "month", price, country } = req.body;
      const { error } = validateCreateProduct({
        name,
        description,
        currency,
        recurring,
        price,
        country,
      });
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const result = await AdminSvc.processProductCreation(req.body);

      return handleResponse(res, result, "PRODUCT_CREATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getProducts(req: Request, res: Response) {
    try {
      const { _id, status = "ACTIVE", country } = req.query;
      const query = {
        status,
      };
      if (_id) query["_id"] = new ObjectId(_id as string);
      if (country) query["tenant"] = country;
      const result = await StripeProductSvc.getProducts(query);
      return handleResponse(res, result, "ALL_PRODUCTS_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  //patch keywords
  static async updateKeywords(req: Request, res: Response) {
    try {
      await KeywordSvc.forceUpdateKeywords({ status: false }, {});
      const query = { deletedAt: null, keywords: { $gt: [{ $size: "$keywords" }, 1] } };

      const [countVenues, countSpace]: any = await Promise.allSettled([VenueSvc.countVenues(query), SpaceSvc.countSpaces(query)]);

      await Promise.allSettled([
        AdminSvc.patchVenueKeywords(countVenues?.value, query, req?.tenant),
        AdminSvc.patchSpaceKeywords(countSpace?.value, query, req?.tenant),
      ]);
      await KeywordSvc.deleteKeywords({ status: false });

      return handleResponse(res, { space: countSpace.value, venue: countVenues.value }, "KEYWORDS_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async migrateFiles(req: Request, res: Response) {
    initFileQueue();
    return handleResponse(res, {}, "FILES_MIGRATED_SUCCESSFULLY");
  }

  static async tenantMigration(req: Request, res: Response) {
    try {
      Promise.all([initTenantUserQueue(req?.tenant?.code), initTenantVenueQueue(req?.tenant?.code)]);
      return handleResponse(res, {}, "TENANT_MIGRATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async deleteUnusedQuestions(req: Request, res: Response) {
    try {
      initQuestionQueue();
      return handleResponse(res, { message: "Deleted Unused Question Successfully" }, "SCRIPT");
    } catch (error) {
      console.log(error);
      return handleErrorResponse(res, error, { code: "Error" });
    }
  }

  static async transferOwnershipRequest(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const venue_id = new ObjectId(req.params.venueId);

      const current_user = new ObjectId(req?.user?._id as string);

      const { error } = validateVenueTransfer(req.body);

      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const [venue] = await VenueSvc.getVenue({ _id: venue_id });

      if (!venue) return handleErrorResponse(res, {}, { code: "VENUE_NOT_FOUND" });

      const payload_user = {
        email,
        role: user_role.VENUE_OWNER,
        status: user_status.PENDING,
        country: venue.address.country,
        venue_id: venue_id,
        venue_name: venue.name,
        current_user,
      };

      const results = await AdminSvc.transferOwnershipInvite(payload_user, req.tenant);

      return handleResponse(res, results, "INVITATION_SENT_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INVITATION_SENDING_FAILED" });
    }
  }

  static async transferOwnershipResend(req: Request, res: Response) {
    const venue_id = new ObjectId(req.params.venueId);
    const [venue] = await VenueSvc.getVenue({ _id: venue_id });

    if (!venue) return handleErrorResponse(res, {}, { code: "VENUE_NOT_FOUND" });

    if (venue.status !== venue_status.REQUEST_TRANSFER_SENT) {
      return handleErrorResponse(res, {}, { code: "INVALID_VENUE_STATUS" });
    }

    const user = await UserSvc.getUser({ _id: venue.user });

    const payload_user = {
      email: user.email,
      role: user.role,
      country: user.country,
      status: user.status,
      venue_id,
      venue_name: venue.name,
    };

    const sendEmail = await AdminSvc.sendVenueOwnerTransfer(user, payload_user, false, req?.tenant);

    return handleResponse(res, sendEmail, "INVITATION_SENT_SUCCESSFULLY");
  }

  static async uploadExcelFile(req: Request, res: Response) {
    try {
      upload.single("file")(req, res, async (err: any) => {
        if (err) {
          return handleErrorResponse(res, err, { code: "FILE_UPLOAD_FAILED" });
        }

        if (!req.file) {
          return handleErrorResponse(res, "No file uploaded", { code: "NO_FILE_UPLOADED" });
        }

        const allowedMimeTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
          return handleErrorResponse(res, "Invalid file format", { code: "INVALID_FILE_FORMAT" });
        }

        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetsData: Record<string, any[]> = parseWorkbook(workbook);

        try {
          validateSheetsData(sheetsData);
        } catch (validationError) {
          return handleErrorResponse(res, validationError, { code: "DATA_VALIDATION_FAILED" });
        }

        const fileData = req.file;
        const fileUploaded = await uploadFileToS3(fileData);

        await FileSrvc.createFiles({
          filename: fileData.originalname,
          contentType: fileData.mimetype,
          size: fileData.size,
          path: fileUploaded,
          uploadedBy: new ObjectId(req.user.id),
          description: req.body.description,
          origin: "DO",
        });

        // Queue the file for further data extraction processing
        initAddVenueQueue(fileData.buffer);

        return handleResponse(res, {}, "UPLOADED_FILE_SUCCESSFULLY");
      });
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async migrateUserRoles(req: Request, res: Response) {
    try {
      initUserRolesQueue();
      return handleResponse(res, {}, "USER_ROLES_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateRating(req: Request, res: Response) {
    const { error } = validateUpdateRatingSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
    }
    const ratingId = new ObjectId(req.params.rating_id);
    const results = await RatingSvc.updateRating({ _id: ratingId }, req.body);
    return handleResponse(res, results, "RATING_UPDATED_SUCCESSFULLY");
  }

  static async getRatings(req: Request, res: Response) {
    const { page = 1, limit = 20 } = req.query as any;

    const pageNumber = parseInt(page.toString());
    const limitNumber = parseInt(limit.toString());
    const offset = (pageNumber - 1) * limitNumber;

    const { error } = validateGetRatingSchema(req.query);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
    }

    const results: { data: any; total: number } = await RatingSvc.getRatings(req?.query, limitNumber, offset, req?.tenant?.code);

    const response = {
      data: results?.data,
      total_pages: Math.ceil(results?.total / limitNumber) || 0,
      total_items: results?.total,
      current_page: pageNumber,
      size: limitNumber,
      offset: offset,
    };

    return handleResponse(res, response, "RATING_FETCH_SUCCESSFULLY");
  }
}

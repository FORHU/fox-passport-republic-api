import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { TAdminMembers } from "../models/admin-members.model";
import { user_role, user_status } from "../models/user.model";
import AdminMemberSvc from "../services/admin-members.service";
import SaleTransactionSvc from "../services/sale-transactions.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { validateAdminMemberSchema } from "../utils/admin-members/validation";
import { verifyToken } from "../utils/auth";
import { ADMIN_ROLES } from "../utils/constant";
import { validateInvitedUserInformationSchema } from "../utils/organization-member/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateCreateVenueSchema } from "../utils/venue/validation";

export default class AdminMemberCtrl {
  static async acceptInvitationAdminMember(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { first_name, last_name, password, phone_number } = req.body;

      const decodedToken = verifyToken(token);
      if (!decodedToken) return handleErrorResponse(res, {}, { code: "INVALID_TOKEN" });

      const { error } = validateInvitedUserInformationSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const userDetails = {
        _id: decodedToken._id,
        first_name,
        last_name,
        email: decodedToken.email,
        password,
        phone_number,
        country: decodedToken.country,
      };

      const result = await AdminMemberSvc.updateAdminMember(userDetails);
      return handleResponse(res, result, "INVITATION_ACCEPTED_SUCCESSFULLY");
    } catch (error) {
      console.log(error);
      return handleErrorResponse(res, error, { code: "INVITATION_ACCEPTING_FAILED" });
    }
  }

  static async inviteAdminMember(req: Request, res: Response) {
    try {
      const { email, assigned_roles } = req.body;
      const country = req?.query?.country || "SG";
      const tenant = req?.tenant;
      const user = new ObjectId(req.user._id as string);
      const { error } = validateAdminMemberSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const existingUser = await UserSvc.getUser({ email });

      if (existingUser) {
        return handleErrorResponse(res, { message: "Existing user" }, { code: "Existing user" });
      }

      const userData = await UserSvc.createUser({
        email,
        role: user_role.ADMIN,
        status: user_status.PENDING,
        ...(tenant && { tenant: tenant?.code }),
      });

      const data = {
        _id: userData?._id,
        admin: user,
        email,
        assigned_roles,
        country,
        createdAt: new Date(),
      };

      const adminMemberData = {
        _id: new ObjectId(),
        admin: new ObjectId(req?.user?._id as string),
        invited_user: new ObjectId(userData?._id),
        assigned_roles: Number(data.assigned_roles),
        status: "PENDING",
        createdAt: new Date(),
      };

      const result = await AdminMemberSvc.inviteAdminMember(data, adminMemberData, tenant);
      return handleResponse(res, result, "INVITATION_SENT_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INVITATION_SENDING_FAILED" });
    }
  }

  static async getAdminMembers(req: Request, res: Response) {
    const { status, search, assigned_roles } = req.query as any;
    const query: any = {};
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (req.tenant) {
      query["invited_user.tenant"] = req.tenant.code;
    }

    if (status) {
      query.status = status as string;
    }

    if (assigned_roles) {
      const rolesArray = Array.isArray(assigned_roles) ? assigned_roles : assigned_roles.split(",").map((role: string) => role.trim());
      query.assigned_roles = {
        $in: rolesArray.map(Number).filter((role: number) => !isNaN(role)),
      };
    }

    if (search) {
      const trimmedSearch = search.trim();
      const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      query["$or"] = [
        { "invited_user.first_name": { $regex: searchRegex } },
        { "invited_user.last_name": { $regex: searchRegex } },
        { "invited_user.phone_number": { $regex: searchRegex } },
        { "invited_user.email": { $regex: searchRegex } },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$invited_user.first_name", " ", "$invited_user.last_name"] },
              regex: trimmedSearch,
              options: "i",
            },
          },
        },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$invited_user.last_name", " ", "$invited_user.first_name"] },
              regex: trimmedSearch,
              options: "i",
            },
          },
        },
      ];
    }
    //auto update those outdated member suspension
    await AdminMemberSvc.handleAdminSuspendedMember({ status: "ACCEPTED", suspension_time: { $ne: null } });
    const result = await AdminMemberSvc.getAdminMembers(query, skip, limit);
    return handleResponse(res, result, "ADMIN_MEMBERS_FETCHED_SUCCESSFULLY");
  }

  static async updateAdminMemberbyId(req: Request, res: Response) {
    const _id = new ObjectId(req.params.id);
    const { assigned_roles, suspension_time, venues = [] } = req.body;

    const { error } = validateAdminMemberSchema(req.body);
    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });

    // const adminMember = await AdminMemberSvc.getAdminMember({ _id: _id });
    // const salesId = adminMember.invited_user;

    // let parseVenue = [];
    // const hasVenueAssigned = venues?.length > 0;
    // if (hasVenueAssigned) {
    //   parseVenue = venues.map((venue: any) => new ObjectId(venue));
    // }

    const updateData: Partial<TAdminMembers> = {
      // ...(hasVenueAssigned && { venues: parseVenue }),
      ...(assigned_roles !== undefined && { assigned_roles }),
      ...(suspension_time !== undefined && { suspension_time }),
      updatedAt: new Date(),
    };

    const result = await AdminMemberSvc.updateAdminMemberById(_id, updateData);

    //Create or update sales transaction for each venue assigned

    // if (hasVenueAssigned) {
    //   const transactionPayload = venues.map((item) => {
    //     return {
    //       user: salesId,
    //       venue: new ObjectId(item),
    //       status: "pending",
    //     };
    //   });

    //   await SaleTransactionSvc.createOrUpdateSaleTransaction(transactionPayload, salesId);
    // }

    return handleResponse(res, result, "ADMIN_MEMBER_UPDATED_SUCCESSFULLY");
  }

  static async deleteAdminMemberbyId(req: Request, res: Response) {
    const _id = new ObjectId(req.params.id as string);
    const user = new ObjectId(req.user._id as string);

    const updatedData = {
      deletedAt: new Date(),
      deletedBy: user,
      status: "DELETED",
    };
   
    const result = await AdminMemberSvc.deleteAdminMemberById(_id, updatedData);
    return handleResponse(res, result, "ADMIN_MEMBER_DELETED_SUCCESSFULLY");
  }

  static async createVenue(req: Request, res: Response) {
    const { error } = validateCreateVenueSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }
    try {
      const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id) });
      if (!user) {
        return handleErrorResponse(res, { error }, { code: "INVALID_USER" });
      }

      const venueResult = await VenueSvc.processVenueCreation(user, req.body);

      return handleResponse(res, { _id: venueResult?.insertedId }, "VENUE_ADDED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_NOT_ADDED" });
    }
  }

  static async getSalesTransaction(req: Request, res: Response) {
    try {
      let query: any = {};
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      if (ADMIN_ROLES[req["admin_role"]] === "SALES") {
        query = { user: new ObjectId(req.user._id as string) };
        query.status = "transferred_ownership";
      }

      if (req.tenant) {
        query["venue.tenant"] = req.tenant?.code;
      }

      const totalCount = await SaleTransactionSvc.countSalesTransaction(query);
      const list = await SaleTransactionSvc.getSalesTransactions(query, skip, limit);

      const result = {
        data: list,
        total_pages: Math.ceil(totalCount / limit) || 0,
        total_items: totalCount,
        current_page: page,
        size: limit,
        offset: skip,
      };

      return handleResponse(res, result, "SALES_TRANSACTION_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "SALES_TRANSACTION_FETCHED_FAILED" });
    }
  }
}

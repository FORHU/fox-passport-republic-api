import dayjs from "dayjs";
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { AuthStatus } from "../models/auth.model";
import AuthSvc from "../services/auth.service";
import OrganizationMemberSvc from "../services/organization-member.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { verifyToken } from "../utils/auth";
import { constructOrgQuery } from "../utils/organization-member/helpers";
import { validateInvitedUserInformationSchema, validateUpdateTeamMemberSchema } from "../utils/organization-member/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class OrganizationMemberCtrl {
  static async acceptInvitation(req: Request, res: Response) {
    try {
      const token = req.params.token;
      const decodedToken = verifyToken(token);
      if (!decodedToken) return handleErrorResponse(res, {}, { code: "INVALID_TOKEN" });

      const { error } = validateInvitedUserInformationSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const result = await OrganizationMemberSvc.teamMemberRegistration(req.body, decodedToken);
      return handleResponse(res, result, "ALL_FIELDS_SATISFIED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async teamMemberInvitation(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id as string);
      const country = req?.query?.country || "SG";
      const tenant = req?.tenant;
      const { error } = validateUpdateTeamMemberSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      req.body.email = req.body.email.toLowerCase();

      const result = await OrganizationMemberSvc.processTeamMemberInvitation(req.body, userId, country, tenant);

      return handleResponse(res, result, "ALL_FIELDS_SATISFIED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: error.message || "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getOrganizationMembers(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10 } = req.query as any;

      const user = await UserSvc.getUser({ _id: new ObjectId(req?.user?._id as string) });

      const pageNumber = parseInt(page.toString());
      const limitNumber = parseInt(limit.toString());
      const offset = (pageNumber - 1) * limitNumber;

      const query = constructOrgQuery(req.query, user);

      await OrganizationMemberSvc.handleSuspendedTeamMembers({ suspension_time: { $ne: null }, status: "ACCEPTED" });
      const list_count = await OrganizationMemberSvc.countOrganizationMember(query);
      const list = await OrganizationMemberSvc.getOrganizationMembers(query, offset, limitNumber);

      const result = {
        data: list,
        total_pages: Math.ceil(list_count / limitNumber) || 0,
        total_items: list_count,
        current_page: page,
        size: limitNumber,
        offset,
      };

      return handleResponse(res, result, "TEAM_MEMBERS_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async deleteOrganizationMember(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.id);
      const userId = new ObjectId(req.user._id);
      const organizationId = {
        _id: _id,
      };

      const user = await UserSvc.getUser({ _id: userId });
      if (!user) {
        handleErrorResponse(res, {}, { code: "USER_NOT_FOUND" });
      }
      const [organizationData] = await OrganizationMemberSvc.getAllOrganizationMembers(organizationId);
      if (!organizationData) {
        handleErrorResponse(res, {}, { code: "ORGANIZATION_MEMBER_NOT_FOUND" });
      } else {
        const invited_user = await UserSvc.getUser({ _id: organizationData.invited_user_id });
        if (!invited_user) {
          handleErrorResponse(res, {}, { code: "USER_NOT_FOUND" });
        } else {
          await UserSvc.updateUser({ _id: invited_user._id }, { organization: new ObjectId() });
        }
      }

      const deletedBy = userId;
      const result = await OrganizationMemberSvc.deleteOrganizationMember(_id, deletedBy);
      return handleResponse(res, result, "SUCCESSFULLY_DELETED_TEAM_MEMBER");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateOrganizationMember(req: Request, res: Response) {
    try {
      const _id = new ObjectId(req.params.id as string);
      const { venues = [], assigned_roles, all_venues, suspension_time } = req.body;
      const { error } = validateUpdateTeamMemberSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const existingMember = await OrganizationMemberSvc.getOrganization({ _id: _id });
      if (!existingMember) {
        return handleErrorResponse(res, {}, { code: "TEAM_MEMBER_NOT_FOUND" });
      }

      const owner_venues: any[] = venues.map((venueId: string) => new ObjectId(venueId));

      let suspensionTime: Date | string | null = null;

      if (suspension_time === "UNTIL_UNSUSPENDED" || !isNaN(Number(suspension_time))) {
        suspensionTime = suspension_time === "UNTIL_UNSUSPENDED" ? "UNTIL_UNSUSPENDED" : dayjs().add(Number(suspension_time), "hour").toDate();
        await AuthSvc.updateAuth(existingMember.invited_user_id, { accessToken: null, refreshToken: null, status: AuthStatus.SUSPENDED });
      } else if (suspension_time === "REMOVE_SUSPENSION") {
        suspensionTime = null;
      }

      const updateData: any = {
        ...(owner_venues.length > 0 && { venues: owner_venues }),
        ...(assigned_roles && { assigned_roles }),
        ...(typeof all_venues === "boolean" && { all_venues }),
        ...(suspensionTime !== undefined && { suspension_time: suspensionTime }),
      };

      const result = await OrganizationMemberSvc.updateOrganizationMembers(_id, updateData);
      return handleResponse(res, result, "TEAM_MEMBER_SUCCESSFULLY_UPDATED");
    } catch (error) {
      handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}

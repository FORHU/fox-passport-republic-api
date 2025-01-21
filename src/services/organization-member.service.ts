/* eslint-disable no-useless-catch */

import { ObjectId } from "mongodb";

import { GOGOJI_URI, VENUE_4_USE_URI } from "../config";
import { StatusType, TOrganizationMember, TUpdateOrganizationMember } from "../models/organization-member.model";
import { hashPassword, user_role, user_status } from "../models/user.model";
import OrganizationMemberRepo from "../repositories/organization-member.repository";
import { generateVerificationToken } from "../utils/auth";
import { getRoleName, sendTemplatedEmail } from "../utils/helpers";
import UserSvc from "./user.service";
import UserRolesSvc from "./user-roles.service";

export default class OrganizationMemberSvc {
  static async teamMemberRegistration(payload: any, decodedToken: any) {
    try {
      const { first_name, last_name, password, phone_number } = payload;
      const _id = new ObjectId(decodedToken._id);

      const hashedPassword = hashPassword(password);
      await UserSvc.updateUser(
        { _id: new ObjectId(decodedToken.invited_user_id) },
        {
          first_name,
          last_name,
          password: hashedPassword,
          phone_number,
          status: user_status.ACTIVE,
        },
      );

      const userRolesData = {
        _id: new ObjectId(),
        user: new ObjectId(decodedToken.invited_user_id),
        role: user_role.VENUE_LISTER,
        password: password,
        status: user_status.ACTIVE,
        organization: new ObjectId(decodedToken.organization),
      };

      await UserRolesSvc.createUserRoles(userRolesData);

      const data = {
        organization: new ObjectId(decodedToken.organization),
        invited_user_id: new ObjectId(decodedToken.invited_user_id),
        venues: decodedToken.venues.map((venue_id: string) => new ObjectId(venue_id)),
        assigned_roles: decodedToken.assigned_roles,
        inviter_user_id: new ObjectId(decodedToken.inviter_user_id),
        status: StatusType.ACCEPTED,
      };

      const result = await OrganizationMemberRepo.updateOrganizationMembers(_id, data);
      return result;
    } catch (error) {
      throw error;
    }
  }
  static async processTeamMemberInvitation(payload: any, userId: ObjectId, country: any, tenant?: any) {
    const { email, venues, assigned_roles, all_venues = false } = payload;

    let owner_venues: any[] = [];

    //current user details
    const user_details: any = await UserSvc.getUser({ _id: userId });

    if (all_venues) {
      owner_venues = [];
    } else if (venues && venues.length > 0) {
      owner_venues = venues.map((venueId: string) => new ObjectId(venueId));
    }

    const [existingMember]: any = await OrganizationMemberSvc.getOrganizationMembers({
      "invited_user.email": email,
      deleteAt: null,
    });

    if (existingMember) {
      throw new Error("USER_IS_ALREADY_A_MEMBER");
    }

    let user_data: any;

    const invitedMember = await UserSvc.getUser({ email: email });

    if (invitedMember) {
      user_data = invitedMember;
    } else {
      user_data = await UserSvc.createUser({
        email,
        role: user_role.VENUE_LISTER,
        organization: user_details.organization,
        status: user_status.PENDING,
        country: user_details.country,
        ...(tenant && { tenant }),
      });
    }

    const data = {
      invited_user_id: user_data?._id,
      invited_user_email: email,
      venues: owner_venues,
      assigned_roles,
      email: user_data?.email,
      country: country,
      all_venues: all_venues,
    };

    const result = await this.teamMemberInvitation(user_details, data, tenant);

    return result;
  }

  static async teamMemberInvitation(userData: any, data: any, tenant?:any) {
    try {
      const payload = {
        _id: new ObjectId(),
        organization: userData.organization,
        invited_user_id: data.invited_user_id,
        venues: data.venues,
        assigned_roles: data.assigned_roles,
        inviter_user_id: userData?._id,
        status: StatusType.PENDING,
        all_venues: data.all_venues,
      };

      const existingUserRole = await UserRolesSvc.getUserRoles({ user: data.invited_user_id, role: user_role.VENUE_LISTER });
      if (existingUserRole) throw new Error("USER_IS_ALREADY_A_VENUE_LISTER");

      await OrganizationMemberSvc.createOrganizationMember(payload);

      const emailTokenPayload = {
        ...payload,
        country: data.country.toUpperCase(),
      };

      const verificationUrl = tenant ? GOGOJI_URI : `${VENUE_4_USE_URI}/${data?.country}`;
      const verification_link = `${verificationUrl}/signup/complete-profile/${generateVerificationToken(emailTokenPayload, "3d")}?email=${data?.email}`;

      const venueOwnerName = `${userData?.first_name || "Venue"} ${userData?.last_name || "Owner"}`;
      const invitedName = `${data?.first_name || "Member"} ${data?.last_name || ""}`;

      const roleName = data.assigned_roles.map((roleId: number) => getRoleName(roleId)).join(", ");

      sendTemplatedEmail({
        subject: `${venueOwnerName} has invited you to join Venue4Use`,
        email_data: {
          verification_link,
          assigned_roles: roleName,
          venueOwnerName,
          invitedName,
          email: data.email,
        },
        template_name: "team-member-invite.html",
      });

      return `Invitation email sent successfully to: ${data.invited_user_email}`;
    } catch (error) {
      throw error;
    }
  }

  static getTotalCountOrganizationMember(query: TOrganizationMember) {
    return OrganizationMemberRepo.countOrganizationMember(query);
  }

  static async getAllOrganizationMembers(query: any) {
    try {
      const result = await OrganizationMemberRepo.getAllOrganizationMembers(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganization(query: any) {
    try {
      const result = await OrganizationMemberRepo.getOrganization(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async createOrganizationMember(data: TOrganizationMember) {
    try {
      const result = await OrganizationMemberRepo.createTeamMember(data);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganizationMembers(query: any, skip?: number, limit?: number) {
    try {
      const result = await OrganizationMemberRepo.getOrganizationMembers(query, skip, limit);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static countOrganizationMember(query: any) {
    return OrganizationMemberRepo.countOrganizationMembers(query);
  }

  static async updateOrganizationMembers(_id: ObjectId, data: TUpdateOrganizationMember) {
    try {
      const result = await OrganizationMemberRepo.updateOrganizationMembers(_id, data);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async deleteOrganizationMember(_id: ObjectId, deletedBy: ObjectId) {
    try {
      const result = await OrganizationMemberRepo.deleteOrganizationMember(_id, deletedBy);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganizationMemberById(invited_user_id: ObjectId) {
    try {
      const result = await OrganizationMemberRepo.getOrganizationMemberById(invited_user_id);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async handleSuspendedTeamMembers(query: any) {
    const limit = 100;
    const currentDate = new Date();
    const total = await OrganizationMemberSvc.getTotalCountOrganizationMember(query);
    for (let offset = 0; offset < total; offset += limit) {
      const venueOwnerMember = await OrganizationMemberSvc.getOrganizationMembers(query, offset, limit);
      for (const member of venueOwnerMember) {
        if (member.suspension_time && currentDate > member.suspension_time) {
          await OrganizationMemberSvc.updateOrganizationMembers(member._id, { suspension_time: null });
        }
      }
    }
  }
}

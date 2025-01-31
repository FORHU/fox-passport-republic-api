import dayjs from "dayjs";
import { ObjectId } from "mongodb";

import { VENUE_4_USE_URI, GOGOJI_URI } from "../config";
import { AdminMemberRoles, TAdminMembers } from "../models/admin-members.model";
import { AuthStatus } from "../models/auth.model";
import { hashPassword, TUser, user_status } from "../models/user.model";
import { TVenue } from "../models/venue.models";
import AdminMembersRepo from "../repositories/admin-members.repository";
import AuthRepo from "../repositories/auth.repository";
import VenueRepo from "../repositories/venue.repository";
import { generateVerificationToken } from "../utils/auth";
import { getCacheOrFetch } from "../utils/cache.util";
import { hashSearch, sendTemplatedEmail } from "../utils/helpers";
import CountrySettingSvc from "./country-setting.service";
import KeywordSvc from "./keyword.service";
import UserSvc from "./user.service";

const PREFIX = "ADMIN_MEMBERS";

export default class AdminMemberSvc {
  static async updateAdminMember(userDetails: TUser) {
    const hashedPassword = hashPassword(userDetails.password);
    const userId = new ObjectId(userDetails._id);
    const [adminUser] = await AdminMembersRepo.getAdminMembers({ "invited_user._id": userId }, 0, 1);

    const userData = {
      password: hashedPassword,
      status: user_status.ACTIVE,
      first_name: userDetails.first_name,
      last_name: userDetails.last_name,
      phone_number: userDetails.phone_number,
      country: userDetails.country,
    };

    await UserSvc.updateUser({ _id: userId }, userData);
    const result = await AdminMembersRepo.updateAdminMemberById(adminUser._id, {
      status: "ACCEPTED",
      updatedAt: new Date(),
    });
    return result;
  }

  static async handleCreateAdminMember(data: any) {
    const result = await AdminMembersRepo.createAdminMember(data);
    return result;
  }

  static async inviteAdminMember(data: any, adminMemberData: any, tenant: any) {
    await AdminMemberSvc.handleCreateAdminMember(adminMemberData);
    const token = generateVerificationToken(data, "3d");

    const roleString =
      data.assigned_roles === AdminMemberRoles.ADMIN
        ? "Admin"
        : data.assigned_roles === AdminMemberRoles.MEMBER
          ? "Member"
          : data.assigned_roles === AdminMemberRoles.SALES
            ? "Sales"
            : "Unknown Role";
    const verificationUrl = tenant?.config.site_url;
    sendTemplatedEmail({
      subject: "Venue4Use: Admin Invitation",
      email_data: {
        verification_link: `${verificationUrl}/signup/complete-profile/${token}?email=${data?.email}&admin_invite=true`,
        assigned_roles: roleString,
        email: data.email,
      },
      template_name: "admin-invite.html",
    });

    return token;
  }

  static async getAdminMembers(query: any, skip: number, limit: number) {
    const total_items = await getCacheOrFetch(hashSearch({ query, description: "countGetAdminMembers" }), PREFIX, () =>
      AdminMembersRepo.countAdminMembers(query),
    );
    const total_pages = Math.ceil(total_items / limit);
    const data = await getCacheOrFetch(hashSearch({ query, description: "getAdminMembers", skip, limit }), PREFIX, () =>
      AdminMembersRepo.getAdminMembers(query, skip, limit),
    );

    return {
      data,
      total_items,
      total_pages,
      current_page: skip,
      size: limit,
    };
  }

  static async countAdminMembers(query: any) {
    return AdminMembersRepo.countAdminMembers(query);
  }

  static async handleGetAdminMembers(query: any, page: number, limit: number) {
    const data = await AdminMembersRepo.getAdminMembers(query, page, limit);
    return data;
  }

  static async getAllAdminMembers(query: any) {
    return await AdminMembersRepo.getAllAdminMembers(query);
  }

  static async updateAdminMemberById(id: ObjectId, updatedData: Partial<TAdminMembers>) {
    let suspensionTime: Date | string | null = null;
    const suspensionTimeData = updatedData.suspension_time;

    const [existingMember] = await AdminMembersRepo.getAdminMembers({ _id: id }, 0, 1);
    if (suspensionTimeData) {
      if (suspensionTimeData === "UNTIL_UNSUSPENDED" || !isNaN(Number(suspensionTimeData))) {
        suspensionTime = suspensionTimeData === "UNTIL_UNSUSPENDED" ? "UNTIL_UNSUSPENDED" : dayjs().add(Number(suspensionTimeData), "hour").toDate();

        await AuthRepo.updateAuth(existingMember.invited_user_id, {
          accessToken: null,
          refreshToken: null,
          status: AuthStatus.SUSPENDED,
        });
      } else if (suspensionTimeData === "REMOVE_SUSPENSION") {
        suspensionTime = null;
      }
    }

    const updatedMemberData: Partial<TAdminMembers> = {
      ...updatedData,
      ...(suspensionTime !== null && { suspension_time: suspensionTime }),
    };

    return await AdminMembersRepo.updateAdminMemberById(id, updatedMemberData);
  }

  static async deleteAdminMemberById(id: ObjectId, updatedData: Partial<TAdminMembers>) {
    return await AdminMembersRepo.deleteAdminMemberById(id, updatedData);
  }

  static async createVenue(user: any, payload: Partial<TVenue>) {
    const { name, keywords, description, representation, form_steps = 1, status, payment_method } = payload;

    const country = user?.country || "SG";
    const [country_settings] = await CountrySettingSvc.getCountrySetting({ cca2: country });

    let country_commission = 0.15,
      country_rebate = 0;

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
      organization: user.organization,
      ...(representation && { representation }),
      ...(description && { description }),
      ...(newKeywords.length > 0 && { keywords: newKeywords }),
      form_steps,
      status,
      ...(country_commission && { commission: country_commission }),
      ...(country_rebate && { rebate: country_rebate }),
      payment_method,
    };
    return VenueRepo.createVenue(venueData);
  }

  static async handleAdminSuspendedMember(query: any) {
    const limit = 100;
    const currentDate = new Date();
    const total = await AdminMemberSvc.countAdminMembers(query);
    for (let offset = 0; offset < total; offset += limit) {
      const adminMember = await AdminMemberSvc.handleGetAdminMembers(query, offset, limit);
      for (const member of adminMember) {
        if (member.suspension_time && currentDate > member.suspension_time) {
          await AdminMemberSvc.updateAdminMemberById(member._id, { suspension_time: null });
        }
      }
    }
    return;
  }

  static async getAdminMember(query: any) {
    return AdminMembersRepo.getAdminMember(query);
  }
}

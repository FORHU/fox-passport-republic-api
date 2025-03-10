import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import { enquiry_status, TEnquiries } from "../models/enquiries.model";
import CustomOfferRepo from "../repositories/custom-offer.repository";
import EnquiryRepo from "../repositories/enquiries.repository";
import OrganizationMemberRepo from "../repositories/organization-member.repository";
import SpaceRepository from "../repositories/space.repository";
import UserRepo from "../repositories/user.repository";
import VenueRepo from "../repositories/venue.repository";
import { constructQuery } from "../utils/enquiries/helpers";
import { calculatePagination, dateFormat, sendTemplatedEmail, formatDateTimeAsObject } from "../utils/helpers";
import { generateRoomId } from "../utils/inbox.utils";
import { logger } from "../utils/logger";
import { handleInitCreateEnquiry, handleInitGetEnquiry, handleInitUpdateEnquiry } from "../utils/v2/microservices/enquiry";
import InboxSvc from "./inbox.service";
import MessageSvc from "./message.services";
import UserSvc from "./user.service";
import VenueSvc from "./venue.service";
import { NotificationStatusType, NotificationType, TNotications } from "../models/notification.model";
import NotificationSvc from "./notification.service";
import { initializeFirebaseAdmin } from "../utils/firebase/firebase.admin";

const firebaseAdmin = initializeFirebaseAdmin();
export default class EnquirySvc {
  static async createEnquiry(data: TEnquiries, message: string, tenant?: any) {
    let result = null;
    if (IS_ENQUIRY_MICROSERVICES) {
      result = handleInitCreateEnquiry(data);
    } else {
      result = await EnquiryRepo.createEnquiries(data);
    }

    const organizationMembers = await OrganizationMemberRepo.getOrganizationMembers({ organization: data?.organization, all_venues: true });
    let userRecipients = organizationMembers.map((members) => members.invited_user);

    const membersWithSelectedVenues = await OrganizationMemberRepo.getAllOrganizationMembers({
      organization: data?.organization,
      venues: { $in: [data.venue] },
    });

    const membersId = membersWithSelectedVenues.map((members) => members.invited_user_id);

    const membersDetail = await UserSvc.getUsers({ _id: { $in: membersId } });
    if (membersDetail.length > 1) {
      userRecipients = userRecipients.concat(membersDetail.map((members) => members));
    }

    const userDataSender = await UserRepo.getUser({ _id: data.user });
    const spaceData = await SpaceRepository.getSpace({ _id: data.space });

    for (const userRecipient of userRecipients) {
      const recipientFirstName = userRecipient?.first_name?.replace(/_/g, " ") || "Venue Owner";
      const senderFirstName = userDataSender?.first_name?.replace(/_/g, " ") || "Client";

      if (userRecipient.email) {
        sendTemplatedEmail({
          subject: `Venue4Use - New Message Notification`,
          email_data: {
            first_name: recipientFirstName,
            sender_first_name: senderFirstName,
            sender_email: userDataSender.email.replace(/_/g, " "),
            email: userRecipient.email,
            message: message,
            inquired_space: spaceData.name,
          },
          template_name: "new-message-notification.html",
          support_email: tenant?.config?.support_email,
          email_credentials: tenant?.config?.email_credentials,
          tenant: tenant?.config?.name,
        });

        logger.log({
          level: "info",
          message: `Email sent to ${userRecipient.email}.`,
        });
      } else {
        logger.log({
          level: "warn",
          message: `Missing email details for ${recipientFirstName}. Failed to send email.`,
        });
      }
    }

    return result;
  }

  static async processEnquiryCreation(payload: any, _space: any, user: any, tenant?: any) {
    const { type, guests, value, space, date, own_catering = false, require_catering = false, flexible_time, catering_options, message } = payload;

    const spaceId = new ObjectId(space as string);
    const enquiryId = new ObjectId();
    const senderId = new ObjectId(user?._id as string);

    const [_venue]: any = await VenueSvc.getVenue({ _id: _space.venue });
    const receiverId = _venue?.user?._id;
    const room_id: string = generateRoomId();

    const formattedDate = dateFormat(date);

    const inbox: any = await InboxSvc.createInbox({
      room_id,
      sender: new ObjectId(user._id as string),
    });

    const messagePayload: any = {
      inbox: inbox?.insertedId,
      room_id,
      sender: new ObjectId(user._id as string),
      generated_content: {
        message: message,
        guests,
        event_date: date?.date,
        timeFrom: date?.from,
        timeTo: date?.to,
        event_type: type,
        space_name: _space?.name,
        venue_name: _venue?.name,
        own_catering,
        require_catering,
      },
      admin_generated: true,
      createdAt: new Date(),
    };

    const initialMessagePayload: any = {
      inbox: inbox?.insertedId,
      room_id,
      sender: senderId,
      content: message,
      createdAt: new Date(Date.now() + 100),
    };

    await MessageSvc.bulkCreateMessage([messagePayload, initialMessagePayload]);

    const pushNotification = {
      notification: {
        title: "New Inquiry",
        body: "You have a new inquiry to review.",
      },
      data: {
        type: NotificationType.INQUIRY,
        enquiryId: String(enquiryId),
      },
      android: {
        notification: {
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      topic: receiverId,
    };

    const notificationData: TNotications = {
      sender: senderId,
      receiver: receiverId,
      metadata: { enquiry_id: enquiryId },
      title: pushNotification.notification.title,
      body: pushNotification.notification.body,
      status: NotificationStatusType.UNREAD,
    };

    await Promise.all([NotificationSvc.createNotification(notificationData), firebaseAdmin.messaging().send(pushNotification)]);

    const enquiryData = {
      _id: enquiryId,
      date: formattedDate,
      type,
      guests: Number(guests),
      value,
      space: spaceId,
      venue: _venue._id,
      organization: _venue.organization,
      own_catering,
      require_catering,
      flexible_time,
      catering_options,
      user: new ObjectId(user?._id as string),
      inbox: inbox.insertedId,
    };

    return await this.createEnquiry(enquiryData, message, tenant);
  }

  static async updateEnquiry(query: any, data: any, tenant?: any) {
    const result = await EnquiryRepo.updateEnquiry(query, data);
    const [customOfferData] = await CustomOfferRepo.getCustomOffer({ "enquiry._id": query._id });
    if (!customOfferData) {
      return result;
    }
    const [venueData] = await VenueRepo.getPaginatedVenues({ _id: customOfferData.venue._id }, 0, 1);

    switch (data.status) {
      case enquiry_status.BOOKING_REQUEST_DECLINED:
        sendTemplatedEmail({
          subject: `Booking Declined Notice`,
          email_data: {
            booking_date: customOfferData?.date?.date,
            space_name: customOfferData?.space?.name,
            client_name: customOfferData?.user?.first_name || "Client",
            email: customOfferData.user.email,
          },
          template_name: "booking-declined.html",
          support_email: tenant?.config?.support_email,
          email_credentials: tenant?.config?.email_credentials,
          tenant: tenant?.config?.name,
        });
        break;

      case enquiry_status.BOOKING_REQUEST_WITHDRAWN:
        sendTemplatedEmail({
          subject: `Booking Withdrawal Notice`,
          email_data: {
            space_name: customOfferData?.space?.name || "",
            venue_owner_name: venueData?.user?.first_name || "Venue Owner",
            booking_date: customOfferData?.date?.date || "",
            start_time: customOfferData?.date?.from || "",
            end_time: customOfferData?.date?.to || "",
            email: venueData?.user?.email,
          },
          template_name: "booking-withdrawn.html",
          support_email: tenant?.config?.support_email,
          email_credentials: tenant?.config?.email_credentials,
          tenant: tenant?.config?.name,
        });
        break;

      default:
        break;
    }
    return result;
  }

  static async getPaginatedEnquiries(params: any, venues: any, user: any) {
    const {
      space_id,
      venue_id,
      page = 1,
      limit = 10,
      enquiry_id,
      status,
      toggle_censor,
      toggle_current,
      search_name,
      event_type,
      guests,
      event_date,
    } = params as any;

    const userId = new ObjectId(user._id as string);
    const userData: any = await UserSvc.getUser({ _id: userId });

    const censorPhoneNumber = toggle_censor === "true";
    const togglePastCurrent = toggle_current === "true" ? true : toggle_current === "false" ? false : null;

    const newDate = new Date();
    newDate.setDate(newDate.getDate() - 1);

    const date = formatDateTimeAsObject(newDate);
    const formattedDate = dateFormat(date);
    const endDate = formattedDate.timestamp.end_date_time;

    await Promise.all([EnquiryRepo.updateEnquiriesArchiveStatus(endDate), EnquiryRepo.updateEnquiriesHappenedStatus(endDate)]);

    const pageNumber = parseInt(page.toString());
    const limitNumber = parseInt(limit.toString());
    const offset = (pageNumber - 1) * limitNumber;

    const query: any = constructQuery(params, userData, userId, togglePastCurrent, venues);
    const formatResult = (data: any[], totalItems: number) => ({
      data,
      ...calculatePagination(totalItems, limitNumber, page, offset),
    });

    let data, totalItems;
    if (IS_ENQUIRY_MICROSERVICES) {
      const enquiryPayload = {
        space_id,
        search_name,
        event_type,
        guests,
        event_date,
        venue_id,
        enquiry_id,
        status,
        togglePastCurrent,
        censorPhoneNumber,
        user: userData,
        offset,
        limitNumber,
      };

      ({ enquiries: data, count: totalItems } = await EnquirySvc.getEnquiriesFromMicroservice(enquiryPayload));
    } else {
      [totalItems, data] = await Promise.all([
        EnquirySvc.getTotalCountEnquiry(query),
        EnquirySvc.getEnquiries(query, offset, limitNumber, censorPhoneNumber),
      ]);
    }

    const result = formatResult(data, totalItems);
    return result;
  }
  static getTotalCountEnquiry(query: any) {
    return EnquiryRepo.countEnquiries(query);
  }

  static getEnquiries(query: any, skip?: number, limit?: number, toggle_censor?: boolean) {
    return EnquiryRepo.getEnquiries(query, skip, limit, toggle_censor);
  }

  static getEnquiriesFromMicroservice(payload: any) {
    return handleInitGetEnquiry(payload);
  }

  static updateEnquiriesFromMicroservice(enquiry_id: ObjectId, payload: any) {
    return handleInitUpdateEnquiry(enquiry_id, payload);
  }

  static getEnquiry(query: any) {
    return EnquiryRepo.getEnquiry(query);
  }

  static async getOneEnquiry(inboxId: string) {
    try {
      const enquiry = await EnquiryRepo.getOneEnquiry(new ObjectId(inboxId));
      return enquiry;
    } catch (error) {
      throw new Error(`Error retrieving enquiry: ${error}`);
    }
  }

  static async getOneEnquiryPhoto(space_id: ObjectId) {
    try {
      const enquiryPhoto = await EnquiryRepo.getOneEnquiryPhoto(space_id);
      return enquiryPhoto;
    } catch (error) {
      throw new Error(`Error retrieving enquiry photo: ${error}`);
    }
  }

  static async countAllEnquiries(query: any) {
    try {
      const count = await EnquiryRepo.countAllEnquiries(query);
      return count;
    } catch (error) {
      throw new Error(`Error counting enquiries: ${error}`);
    }
  }

  static async deleteEnquiry(_id: ObjectId, data: any) {
    try {
      const result = await EnquiryRepo.deleteEnquiry(_id, data);
      return result;
    } catch (error) {
      throw new Error(`Error deleting enquiry: ${error}`);
    }
  }
}

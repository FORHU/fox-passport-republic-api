import { ObjectId } from "mongodb";
import { Server, Socket } from "socket.io";

import { CC_SUPPORT_EMAIL, IS_ENQUIRY_MICROSERVICES } from "../config";
import authenticateTokenAndStatus from "../middleware/authenticate-socket";
import { enquiry_status } from "../models/enquiries.model";
import { metaDataKey, NotificationType } from "../models/notification.model";
import { user_role } from "../models/user.model";
import CustomOfferSvc from "../services/custom-offer.service";
import EnquirySvc from "../services/enquiries.service";
import FileSvc from "../services/file.service";
import InboxSvc from "../services/inbox.service";
import MessageSvc from "../services/message.services";
import NotificationSvc from "../services/notification.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { LookupFields } from "../types/common";
import { pushNotification } from "../utils/firebase/firebase.admin";
import { sendTemplatedEmail } from "../utils/helpers";
import { logger } from "../utils/logger";

interface AuthenticatedSocket extends Socket {
  user?: any;
  tenant?: any;
}

export default (io: Server) => {
  io.use((socket: AuthenticatedSocket, next) => {
    authenticateTokenAndStatus(socket, (err?: Error) => {
      if (err) {
        console.error("Socket authentication failed:", err.message);
        next(err); // Pass error to Socket.IO
      } else {
        console.log("Socket authenticated successfully:", socket.user);
        next(); // Proceed with socket connection
      }
    });
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    if (socket.user) {
      // console.log("Authenticated user:", socket.user);
    }

    // Handle join room event
    socket.on("join_room", (data) => {
      const { room_id } = data;
      // Join the dynamically generated room
      socket.join(room_id);
      // emit an event to notify the client about the room ID
      socket.emit("join_room", room_id);
    });

    // Handle send message event
    socket.on("send_message_to_room", async (data: any) => {
      const { room_id, message, attachments = [] } = data;
      logger.log({
        level: "info",
        message: `PAYLOAD_SEND_MESSAGE_TO_ROOM: ${JSON.stringify(data)}`,
      });

      if (socket.user) {
        const lookups: LookupFields[] = [
          {
            collection_name: "files",
            field_name: "profile_picture",
            unwind: true,
          },
        ];
        const sender = await UserSvc.getUser({ _id: new ObjectId(socket.user._id as string) }, lookups);
        const attachmentIds = attachments.map((attachment_id: any) => new ObjectId(attachment_id as string));
        const attachmentFiles = await FileSvc.getFiles(attachmentIds);

        logger.log({
          level: "info",
          message: `PAYLOAD_EMIT_SEND_MESSAGE_TO_ROOM: ${JSON.stringify({
            room_id,
            sender,
            content: message,
            attachments: attachmentFiles,
            createdAt: new Date().toISOString(),
          })}`,
        });

        io.to(room_id).emit("send_message_to_room", {
          room_id,
          sender,
          content: message,
          attachments: attachmentFiles,
          createdAt: new Date().toISOString(),
        });
        const inbox: any = await InboxSvc.getInbox({ room_id });

        let enquiry = null;
        if (IS_ENQUIRY_MICROSERVICES) {
          const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ inbox_id: inbox._id });
          [enquiry] = enquiries;
        } else {
          [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": inbox._id }, 0, 1);
        }

        const isVenueOrAdminRole = [user_role.VENUE_OWNER, user_role.ADMIN].includes(socket.user.role);

        const recepient_email = isVenueOrAdminRole ? enquiry.user.email : enquiry.venue.user.email;
        const recipient_first_name = isVenueOrAdminRole ? enquiry.user.first_name : enquiry.venue.user.first_name;
        const sender_first_name = isVenueOrAdminRole ? enquiry.venue.user.first_name : enquiry.user.first_name;
        const sender_email = isVenueOrAdminRole ? enquiry.venue.user.email : enquiry.user.email;

        const receiverId = isVenueOrAdminRole ? enquiry.user._id : enquiry.venue.user._id;
        const senderUser = isVenueOrAdminRole ? enquiry.venue.user : enquiry.user;
        const sender_full_name = `${senderUser.first_name} ${senderUser.last_name}`;
        const senderId = senderUser._id;

        //TO NOTIFY USER FOR UNREAD NOTIFICATION COUNT
        const notification = await NotificationSvc.getNotificationByRoomId(receiverId);
        io.to(notification?.room_id).emit("notification_count", {
          success: true,
          code: "NOTIFICATION_COUNT_FETCHED_SUCCESSFULLY",
          data: notification?.count,
        });

        const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
        const existingNotification = await NotificationSvc.getOneNotification({
          title: "New Inquiry",
          createdAt: { $lte: tenSecondsAgo },
          "metadata.enquiry_id": enquiry._id,
        });

        const participants = {
          senderId,
          receiverId,
          userId: String(receiverId),
        };

        const metadata = {
          [metaDataKey.ENQUIRY_ID]: enquiry._id,
        };

        if (existingNotification) {
          await pushNotification(
            { title: sender_full_name, body: message },
            { type: NotificationType.INQUIRY, enquiryId: String(enquiry._id) },
            { notification: { sound: "default" } },
            { payload: { aps: { sound: "default" } } },
            participants,
            metadata,
          );
        } else {
          await pushNotification(
            { title: "New Inquiry", body: "You have a new inquiry to review." },
            { type: NotificationType.INQUIRY, enquiryId: String(enquiry._id) },
            { notification: { sound: "default" } },
            { payload: { aps: { sound: "default" } } },
            participants,
            metadata,
          );
        }

        logger.log({
          level: "info",
          message: `PAYLOAD_EMIT_SEND_EMAIL_NOTIFICATION: ${JSON.stringify({
            subject: `Venue4Use - New Message Notification`,
            email_data: {
              first_name: recipient_first_name.replace(/_/g, " "),
              sender_first_name: sender_first_name.replace(/_/g, " "),
              sender_email: sender_email.replace(/_/g, " "),
              email: recepient_email,
              message: message,
              inquired_space: enquiry.space.name,
            },
            template_name: "new-message-notification.html",
          })}`,
        });

        sendTemplatedEmail({
          subject: `${socket?.tenant?.config?.name} - New Message Notification`,
          email_data: {
            first_name: recipient_first_name.replace(/_/g, " "),
            sender_first_name: sender_first_name.replace(/_/g, " "),
            sender_email: sender_email.replace(/_/g, " "),
            email: recepient_email,
            message: message,
            inquired_space: enquiry.space.name,
          },
          template_name: "new-message-notification.html",
          cc: CC_SUPPORT_EMAIL,
        });

        if (enquiry.status === enquiry_status.NEW) {
          sendTemplatedEmail({
            subject: `${socket?.tenant?.config?.name} Your Inquiry Status Update - Now ${enquiry_status.IN_PROGRESS.replace(/_/g, " ")}`,
            email_data: {
              previous_status: enquiry.status.replace(/_/g, " "),
              new_status: enquiry_status.IN_PROGRESS.replace(/_/g, " "),
              space_name: enquiry.space.name,
              first_name: enquiry.user.first_name,
              email: enquiry.user.email,
            },
            template_name: "enquiry-status.html",
          });
          await EnquirySvc.updateEnquiry({ inbox: new ObjectId(inbox?._id as string) }, { status: enquiry_status.IN_PROGRESS });
        }
        await MessageSvc.createMessage({
          inbox: inbox?._id,
          room_id,
          sender: new ObjectId(socket.user._id as string),
          receiver: receiverId,
          content: message,
          attachments: attachmentIds,
        });
      }
    });

    socket.on("generate_custom_offer", async (data: any) => {
      const { room_id, custom_offer_id, message } = data;
      const [customOffer]: any = await CustomOfferSvc.getCustomOffer({ _id: new ObjectId(custom_offer_id as string) });
      const [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": customOffer.inbox }, 0, 1);
      const messagePayload: any = {
        inbox: customOffer?.inbox,
        key: "CUSTOM_OFFER_SENT",
        room_id,
        sender: new ObjectId(socket?.user?._id as string),
        generated_content: {
          payment_computation: {
            venue_computation: customOffer?.venue_computation,
            user_computation: customOffer?.user_computation,
          },
          message,
          guests: customOffer?.guests,
          event_date: customOffer?.date?.date,
          timeFrom: customOffer?.date?.from,
          timeTo: customOffer?.date?.to,
          event_type: enquiry?.type,
          space_name: customOffer?.space?.name,
          venue_name: customOffer?.venue?.name,
          currency: customOffer?.currency,
        },
        admin_generated: true,
        createdAt: new Date(),
      };

      const sender = await UserSvc.getUser({ _id: new ObjectId(socket.user._id as string) });
      io.to(room_id).emit("send_message_to_room", {
        room_id,
        key: "CUSTOM_OFFER_SENT",
        sender,
        content: message,
        generated_content: messagePayload?.generated_content,
        admin_generated: true,
        createdAt: new Date().toISOString(),
      });
      await MessageSvc.createMessage(messagePayload);

      const isVenueOrAdminRole = [user_role.VENUE_OWNER, user_role.ADMIN].includes(socket.user.role);

      const receiverId = isVenueOrAdminRole ? enquiry.user._id : enquiry.venue.user._id;
      const senderUser = isVenueOrAdminRole ? enquiry.venue.user : enquiry.user;
      const sender_full_name = `${senderUser.first_name} ${senderUser.last_name}`;
      const senderId = senderUser._id;

      const participants = {
        senderId,
        receiverId,
        userId: String(receiverId),
      };

      const metadata = {
        [metaDataKey.CUSTOM_OFFER_ID]: custom_offer_id,
        [metaDataKey.ENQUIRY_ID]: enquiry._id,
      };

      await pushNotification(
        { title: "Custom Offer Received", body: `You have received a custom offer from ${sender_full_name}` },
        { type: NotificationType.CUSTOM_OFFER, customOfferId: String(custom_offer_id), enquiryId: String(enquiry._id) },
        { notification: { sound: "default" } },
        { payload: { aps: { sound: "default" } } },
        participants,
        metadata,
      );
    });

    socket.on("custom_offer_status", async (data: any) => {
      const { room_id, custom_offer_id, message = null, key } = data;
      const [customOffer]: any = await CustomOfferSvc.getCustomOffer({ _id: new ObjectId(custom_offer_id as string) });
      const [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": customOffer.inbox }, 0, 1);

      const isVenueOrAdminRole = [user_role.VENUE_OWNER, user_role.ADMIN].includes(socket.user.role);
      const receiverId = isVenueOrAdminRole ? enquiry.user._id : enquiry.venue.user._id;
      const senderUser = isVenueOrAdminRole ? enquiry.venue.user : enquiry.user;
      const sender_full_name = `${senderUser.first_name} ${senderUser.last_name}`;
      const senderId = senderUser._id;

      const excludedKeys = ["CANCELLED", "DECLINED", "BOOKING_CONFIRMED"];

      if (!excludedKeys.includes(key)) {
        const participants = {
          senderId,
          receiverId,
          userId: String(receiverId),
        };

        const metadata = {
          [metaDataKey.CUSTOM_OFFER_ID]: custom_offer_id,
          [metaDataKey.ENQUIRY_ID]: enquiry._id,
        };

        await pushNotification(
          { title: "Custom Offer Updated", body: `You're custom offer was updated by ${sender_full_name}` },
          { type: NotificationType.CUSTOM_OFFER, customOfferId: String(custom_offer_id), enquiryId: String(enquiry._id) },
          { notification: { sound: "default" } },
          { payload: { aps: { sound: "default" } } },
          participants,
          metadata,
        );
      }

      const messagePayload: any = {
        inbox: customOffer?.inbox,
        key,
        room_id,
        sender: new ObjectId(socket?.user?._id as string),
        generated_content: {
          payment_computation: {
            venue_computation: customOffer?.venue_computation,
            user_computation: customOffer?.user_computation,
          },
          message,
          guests: customOffer?.guests,
          event_date: customOffer?.date?.date,
          timeFrom: customOffer?.date?.from,
          timeTo: customOffer?.date?.to,
          event_type: customOffer?.enquiry?.type,
          space_name: customOffer?.space?.name,
          venue_name: customOffer?.venue?.name,
          currency: customOffer?.currency,
        },
        admin_generated: true,
        createdAt: new Date(),
      };
      const sender = await UserSvc.getUser({ _id: new ObjectId(socket.user._id as string) });
      io.to(room_id).emit("send_message_to_room", {
        room_id,
        key,
        sender,
        content: message,
        generated_content: messagePayload?.generated_content,
        admin_generated: true,
        createdAt: new Date().toISOString(),
      });
      await MessageSvc.createMessage(messagePayload);
    });

    socket.on("request_phone_number", async (data: any) => {
      const { room_id, key, enquiry_id } = data;
      const [enquiry]: any = await EnquirySvc.getEnquiry({ _id: new ObjectId(enquiry_id as string) });
      const [venue]: any = await VenueSvc.getVenue({ _id: new ObjectId(enquiry?.venue as string) });
      const user: any = await UserSvc.getUser({ _id: venue.user });
      const sender = await UserSvc.getUser({ _id: new ObjectId(socket.user._id as string) });
      const messagePayload: any = {
        inbox: enquiry?.inbox,
        key,
        room_id,
        sender: new ObjectId(socket?.user?._id as string),
        generated_content: {
          message: null,
          user_info: {
            phone_number: user?.phone_number,
            first_name: user?.first_name,
            last_name: user?.last_name,
          },
        },
        admin_generated: true,
        createdAt: new Date(),
      };

      io.to(room_id).emit("send_message_to_room", {
        room_id,
        key,
        sender,
        content: "",
        generated_content: messagePayload?.generated_content,
        admin_generated: true,
        createdAt: new Date().toISOString(),
      });
      await MessageSvc.createMessage(messagePayload);
    });

    socket.on("disconnect", () => {
      // console.log("Client disconnected from organization namespace");
    });
  });
};

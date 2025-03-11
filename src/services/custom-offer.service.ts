import { ObjectId } from "mongodb";

import { booking_status } from "../models/booking.model";
import { CounterType } from "../models/counter.model";
import { offer_status } from "../models/custom-offer.model";
import { enquiry_status } from "../models/enquiries.model";
import { RequestStatus, RequestType } from "../models/requests.model";
import CustomOfferRepo from "../repositories/custom-offer.repository";
import { convertCentsToDollars, convertDollarsToCents, convertToIsoDate, dateFormat, sendTemplatedEmail } from "../utils/helpers";
import { useMongoClient, useTransactionOptions } from "../utils/mongo";
import { initInvoiceQueueProcess } from "../utils/queues/invoice";
import { handlePayment } from "../utils/stripe";
import BookingSvc from "./booking.service";
import CounterSvc from "./counter.service";
import EnquirySvc from "./enquiries.service";
import PaymentSvc from "./payment.service";
import RequestSvc from "./requests.service";
import StripeAccountSvc from "./stripe-account.service";
import StripeAccountTransactionSvc from "./stripe-account-transaction.service";
import StripeCustomerSvc from "./stripe-customer.service";
import UserSvc from "./user.service";
import { user_role } from "../models/user.model";
import { pushNotification } from "../utils/firebase/firebase.admin";
import { metaDataKey, NotificationType } from "../models/notification.model";

export default class CustomOfferSvc {
  static async createCustomOffer(payload: any, enquiry: any, user: any, tenant?: any) {
    try {
      const { inbox_id, date, guests, venue_computation, user_computation, notes, currency } = payload;

      const formattedDate = dateFormat(date);

      const [existingCustomOffer] = await CustomOfferSvc.getCustomOffer({ inbox: new ObjectId(inbox_id as string) });
      if (existingCustomOffer) {
        await CustomOfferSvc.deleteCustomOffer(existingCustomOffer.inbox);
      }

      const user_id = new ObjectId(user?._id as string);
      const inboxId = enquiry.inbox._id;
      const customOfferData = {
        user: user_id,
        inbox: inboxId,
        venue: enquiry.venue._id,
        space: enquiry.space._id,
        date: formattedDate,
        guests,
        venue_computation,
        user_computation,
        notes,
        currency,
        enquiry_id: enquiry._id,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
      };

      await EnquirySvc.updateEnquiry({ _id: enquiry._id }, { status: enquiry_status.CUSTOM_OFFER_SENT });
      sendTemplatedEmail({
        subject: `Your Inquiry Status Update - Now ${enquiry_status.CUSTOM_OFFER_SENT.replace(/_/g, " ")}`,
        email_data: {
          previous_status: enquiry?.status?.replace(/_/g, " ") || "",
          new_status: enquiry_status.CUSTOM_OFFER_SENT.replace(/_/g, " "),
          space_name: enquiry?.space?.name || "",
          first_name: enquiry?.user?.first_name || "Client",
          email: enquiry?.user?.email || "",
        },
        template_name: "enquiry-status.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });

      return await CustomOfferRepo.createCustomOffer(customOfferData);
    } catch (error) {
      throw new Error("Failed to create custom offer");
    }
  }

  static async getCustomOffer(query: any) {
    try {
      return await CustomOfferRepo.getCustomOffer(query);
    } catch (error) {
      throw new Error("Failed to get custom offer");
    }
  }

  static async archivePreviousOffers(user_id: ObjectId, space: ObjectId, venue: ObjectId, inboxId: ObjectId) {
    try {
      const query = { user: user_id, status: "PENDING", space: space, venue: venue, inbox: inboxId };
      const update = { $set: { status: "ARCHIVE" } };
      await CustomOfferRepo.archiveCustomOffers(query, update);
    } catch (error) {
      throw new Error("Failed to archive previous offers");
    }
  }

  static async updateCustomOffer(_id: ObjectId, data: any, offer: any, tenant?: any, userRole?: any) {
    try {
      let user_recipient: any = null;
      const updatedOffer = await CustomOfferRepo.updateCustomOffer(_id, data);
      const [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": offer.inbox }, 0, 1);

      if (offer) {
        user_recipient = await UserSvc.getUser({ _id: offer.enquiry.user });
        const sendUpdateEmail = (status: string) => {
          if (status === "DECLINED") {
            const isVenueOrAdminRole = [user_role.VENUE_OWNER, user_role.ADMIN].includes(userRole);
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
              key: metaDataKey.CUSTOM_OFFER_ID,
              value: String(_id),
            };

            pushNotification(
              {
                title: "Custom Offer Declined",
                body: `You have received an update from ${sender_full_name}`,
              },
              {
                type: NotificationType.CUSTOM_OFFER,
                customOfferId: String(_id),
                enquiryId: String(enquiry._id),
              },
              { notification: { sound: "default" } },
              { payload: { aps: { sound: "default" } } },
              participants,
              metadata,
            );
          }

          sendTemplatedEmail({
            subject: `Your Inquiry Status Update - Now ${status.replace(/_/g, " ")}`,
            email_data: {
              previous_status: offer?.status?.replace(/_/g, " ") || "",
              new_status: status.replace(/_/g, " "),
              space_name: offer?.space?.name || "",
              first_name: offer?.user?.first_name || "Client",
              email: user_recipient?.email || "",
            },
            template_name: "enquiry-status.html",
            support_email: tenant?.config?.support_email,
            email_credentials: tenant?.config?.email_credentials,
            tenant: tenant?.config?.name,
          });
        };
        switch (data.status) {
          case "OFFER_ACCEPTED":
            sendUpdateEmail(enquiry_status.OFFER_ACCEPTED);
            break;
          case "DECLINED":
            sendUpdateEmail(enquiry_status.DECLINED);
            break;
          case "CANCELLED":
            sendUpdateEmail(enquiry_status.CANCELLED);
            break;
          default:
            break;
        }
      }
      return updatedOffer;
    } catch (error) {
      throw new Error("Failed to update custom offer");
    }
  }

  static async updateCustomOfferStatus(user_id: any, payload: any, custom_offer_id: string, offer: any, tenant?: any) {
    const { status } = payload;

    const user: any = await UserSvc.getUser({ _id: new ObjectId(user_id as string) });
    const updatedOfferData = {
      status,
      updatedAt: new Date(),
    };

    const updatedOffer = await this.updateCustomOffer(new ObjectId(custom_offer_id), updatedOfferData, offer, tenant);
    const counter = await CounterSvc.generateCounter({ type: CounterType.INVOICE });
    const current_date = new Date();
    const year = current_date.getFullYear().toString();
    const counterValue = counter.count.toString().padStart(3, "0");
    const invoiceNo = `INV-${counterValue}-${year}`;

    if (status === offer_status.OFFER_ACCEPTED) {
      await Promise.allSettled([
        initInvoiceQueueProcess({ invoice_no: invoiceNo, user, offer }),
        EnquirySvc.updateEnquiry(
          { _id: offer.enquiry._id },
          {
            status: enquiry_status.OFFER_ACCEPTED,
            date: offer.date,
            guests: offer.guests,
          },
        ),
      ]);
    }

    return updatedOffer;
  }
  static async requestToBook(payload: any, enquiry: any, user: any, tenant?: any) {
    try {
      const { inbox_id, date, guests, venue_computation, user_computation, notes, currency, event_type } = payload;

      const mongoClient = useMongoClient();
      const session = mongoClient.startSession();

      const customOfferId = new ObjectId();
      const bookingId = new ObjectId();
      const payment_id = new ObjectId();
      let client_secret: string = "";

      await session.withTransaction(async () => {
        const formattedDate = dateFormat(date);

        const [existingCustomOffer] = await CustomOfferSvc.getCustomOffer({ inbox: new ObjectId(inbox_id) });
        if (existingCustomOffer) {
          await CustomOfferSvc.deleteCustomOffer(existingCustomOffer.inbox);
        }

        const user_id = new ObjectId(user._id as string);
        const inboxId = enquiry.inbox._id;

        const customer: any = await StripeCustomerSvc.getCustomer({ user: user_id });

        const counter: any = await CounterSvc.generateCounter({ type: CounterType.BOOKING });
        const current_date = new Date();
        const year = current_date.getFullYear().toString();
        const counterValue = counter.count.toString().padStart(3, "0");
        const bookingReference = `REF-${counterValue}-${year}`;

        const customOfferData = {
          _id: customOfferId,
          user: user_id,
          inbox: inboxId,
          venue: enquiry.venue._id,
          space: enquiry.space._id,
          date: formattedDate,
          guests,
          venue_computation,
          user_computation,
          notes,
          currency,
          enquiry_id: enquiry._id,
          booking: bookingId,
          createdAt: new Date(),
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          status: offer_status.BOOKING_REQUESTED,
        };

        const bookingData = {
          _id: bookingId,
          booker: user_id,
          booked_user: enquiry.user?._id,
          space: customOfferData.space,
          venue: customOfferData.venue,
          start_date: formattedDate.timestamp.start_date_time,
          end_date: formattedDate.timestamp.end_date_time,
          total_guest: customOfferData.guests,
          total_price: customOfferData.user_computation.grand_total,
          status: booking_status.BOOKING_REQUESTED,
          booking_reference: bookingReference,
          enquiry: enquiry._id,
          event_type: "BOOKING",
          repeat_event: null,
          event_duration: null,
        };

        const enquiryData = {
          status: enquiry_status.BOOKING_REQUESTED,
          date: formattedDate,
          guests: guests,
          ...(event_type && { type: event_type }),
        };

        const results: any = await Promise.allSettled([
          handlePayment({
            amount: convertDollarsToCents(customOfferData.user_computation.grand_total),
            currency: customOfferData.currency || "SGD",
            customer: customer?.customer_id,
          }),
          BookingSvc.createBooking(bookingData),
          CustomOfferSvc.createOrUpdateCustomOffer({ inbox: enquiry.inbox._id }, customOfferData, { upsert: true }),
          EnquirySvc.updateEnquiry({ _id: enquiry._id }, enquiryData),

          sendTemplatedEmail({
            subject: `Your Inquiry Status Update - Now ${enquiry_status.BOOKING_REQUESTED.replace(/_/g, " ")}`,
            email_data: {
              previous_status: enquiry?.status?.replace(/_/g, " ") || "",
              new_status: enquiry_status.BOOKING_REQUESTED.replace(/_/g, " "),
              space_name: enquiry?.space?.name || " ",
              first_name: enquiry?.user?.first_name || "Client",
              email: enquiry?.user?.email || "",
            },
            template_name: "enquiry-status.html",
            support_email: tenant?.config?.support_email,
            email_credentials: tenant?.config?.email_credentials,
            tenant: tenant?.config?.name,
          }),

          sendTemplatedEmail({
            subject: `${tenant?.config?.name} - Booking Requested`,
            email_data: {
              previous_status: enquiry?.status?.replace(/_/g, " ") || "",
              booking_date: customOfferData?.date?.date || "",
              start_time: customOfferData?.date?.from || "",
              end_time: customOfferData?.date?.to || "",
              space_name: enquiry?.space?.name || " ",
              venue_owner_name: enquiry?.venue?.user?.first_name || "Venue Owner",
              email: enquiry?.venue?.user?.email || "",
            },
            template_name: "booking-requested.html",
            support_email: tenant?.config?.support_email,
            email_credentials: tenant?.config?.email_credentials,
            tenant: tenant?.config?.name,
          }),
        ]);

        client_secret = results[0].value?.client_secret;

        const paymentPayload: any = {
          _id: payment_id,
          venue: enquiry.venue._id,
          space: enquiry.space._id,
          enquiry: enquiry._id,
          user: new ObjectId(user._id as string),
          payment_id: results[0]?.value?.id,
          payment_method: results[0]?.value?.payment_method_types,
          payment_amount: convertCentsToDollars(results[0]?.value?.amount),
          payment_currency: results[0]?.value?.currency,
          payment_object: results[0]?.value?.object,
          payment_created: convertToIsoDate(results[0].value?.created),
          status: results[0]?.value?.status,
          custom_offer: customOfferData?._id,
          client_secret: results[0]?.value?.client_secret,
          booking: results[2]?.value?.insertedId,
        };

        const requestData = {
          type: RequestType.BOOKING,
          status: RequestStatus.BOOKING_REQUEST,
          description: null,
          booking: new ObjectId(),
          request_data: customOfferData,
        };

        // eslint-disable-next-line no-unused-vars
        const [payment, request, stripeAccount]: any = await Promise.allSettled([
          PaymentSvc.createPayment(paymentPayload),
          RequestSvc.createRequest(requestData),
          StripeAccountSvc.getAccount({ user: enquiry.venue.user._id }),
        ]);
        const accountPaymentTransactionPayload: any = {
          stripe_account: stripeAccount?.value?._id,
          payment: payment?.value?.insertedId,
          enquiry: enquiry._id,
          venue: enquiry.venue._id,
          venue_owner: enquiry.venue.user._id,
          space: enquiry.space._id,
          amount: paymentPayload.payment_amount - paymentPayload.payment_amount * 0.15,
        };

        await StripeAccountTransactionSvc.createAccount(accountPaymentTransactionPayload);
      }, useTransactionOptions);

      return { custom_offer_id: customOfferId, booking_id: bookingId, client_secret, payment_id };
    } catch (error) {
      throw new Error();
    }
  }
  static async deleteCustomOffer(inbox_id: ObjectId) {
    try {
      await CustomOfferRepo.deleteCustomOffer(inbox_id);
    } catch (error) {
      throw new Error("Failed to delete custom offer");
    }
  }

  static async createOrUpdateCustomOffer(query: any, payload: any, options?: any) {
    return await CustomOfferRepo.createOrUpdateCustomOffer(query, payload, options);
  }
}

/* eslint-disable no-case-declarations */
/* eslint-disable indent */
import { ObjectId } from "mongodb";

import { CC_SUPPORT_EMAIL, IS_BOOKING_MICROSERVICES, IS_ENQUIRY_MICROSERVICES } from "../config";
import { booking_status } from "../models/booking.model";
import { CounterType } from "../models/counter.model";
import { offer_status } from "../models/custom-offer.model";
import { enquiry_status } from "../models/enquiries.model";
import { TPayment } from "../models/payment.model";
import { account_status } from "../models/stripe-account.model";
import { account_transcation_status } from "../models/stripe-account-transaction.model";
import PaymentRepo from "../repositories/payment.respository";
import { STRIPE_EVENTS } from "../utils/constant";
import { extractTime } from "../utils/enquiries/helpers";
import { convertCentsToDollars, convertDollarsToCents, convertToIsoDate, formatDateTimeToIso, sendTemplatedEmail } from "../utils/helpers";
import { logger } from "../utils/logger";
import { useMongoClient, useTransactionOptions } from "../utils/mongo";
import { initReceiptQueueProcess } from "../utils/queues/receipt";
import {
  createAccount,
  createTransfer,
  deleteAccount,
  getAccount,
  handlePayment,
  handleSubsciption,
  retrieveSubscription,
  retriveAccount,
} from "../utils/stripe";
import BookingSvc from "./booking.service";
import CounterSvc from "./counter.service";
import CountrySettingSvc from "./country-setting.service";
import CustomeOfferSvc from "./custom-offer.service";
import EnquirySvc from "./enquiries.service";
import SpaceSvc from "./space.service";
import StripeAccountSvc from "./stripe-account.service";
import StripeAccountTransactionSvc from "./stripe-account-transaction.service";
import UserSvc from "./user.service";
import VenueSvc from "./venue.service";
import VenueSubscriptionSvc from "./venue-subscription.service";

export default class PaymentSvc {
  static createPayment(data: TPayment) {
    return PaymentRepo.createPayment(data);
  }

  static getPayment(query: any) {
    return PaymentRepo.getPayment(query);
  }

  static updatePayment(query: any, data: any) {
    return PaymentRepo.updatePayment(query, data);
  }

  static async handleWebhooks(event: any) {
    switch (event.type) {
      case STRIPE_EVENTS.ACCOUNT_UPDATED:
        const account = await getAccount(event.account);
        if (account && account?.charges_enabled && account?.details_submitted) {
          await StripeAccountSvc.updateAccount({ stripe_account_id: account?.id }, { status: account_status.COMPLETED, updatedAt: new Date() });
        }
        break;
      case STRIPE_EVENTS.PAYMENT_ATTACHED:
        const subscription_ids = await handleSubsciption(event.data);
        await VenueSubscriptionSvc.updateVenueSubscription({ subscription_id: { $in: subscription_ids } }, { status: "active" });
        break;
      case STRIPE_EVENTS.INVOICE_PAYMENT_SUCCEDED:
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscriptionId = invoice.subscription;
          const subscription = await retrieveSubscription(subscriptionId);
          const currentPeriodEnd = subscription.current_period_end;
          const nextBillingEndDate = new Date(currentPeriodEnd * 1000);
          await VenueSubscriptionSvc.updateVenueSubscription({ subscription_id: subscriptionId }, { endDate: nextBillingEndDate });
        }
        break;
      case STRIPE_EVENTS.INVOICE_FAILED:
        const paymentInvoice: any = event.data.object;
        const subscription_id = paymentInvoice.subscription;
        const userAccount = await VenueSubscriptionSvc.getOneVenueSubscription({ subscription: subscription_id });
        const userDetails = await UserSvc.getUser({ _id: userAccount?.user });

        sendTemplatedEmail({
          subject: "Venue4Use: Insufficient Funds to Continue Your Subscription",
          email_data: {
            email: userDetails?.email,
            first_name: userDetails.first_name.replace(/_/g, " "),
          },
          cc: CC_SUPPORT_EMAIL,
          template_name: "insufficient-funds.html",
        });

        await VenueSubscriptionSvc.updateVenueSubscription({ subscription_id }, { status: "payment_failed" });
        break;
    }
  }
  static async processPayment(enquiry_id: string, user: any, enquiry: any) {
    const venue_owner = new ObjectId(user._id);

    const mongoClient = useMongoClient();
    const session = mongoClient.startSession();
    let client_secret = null;
    let payment_id: any = null;
    let booking_id: any = null;
    const paymentId: ObjectId = new ObjectId();

    await session.withTransaction(async () => {
      const enquiryId = new ObjectId(enquiry_id);

      const [customOfferData]: any = await CustomeOfferSvc.getCustomOffer({ inbox: enquiry.inbox._id });
      const paymentIntent: any = await handlePayment({
        amount: convertDollarsToCents(customOfferData.user_computation.grand_total),
        currency: customOfferData.currency || "SGD",
      });

      client_secret = paymentIntent.client_secret;

      const payment: any = {
        _id: paymentId,
        venue: enquiry.venue._id,
        space: enquiry.space._id,
        enquiry: enquiry._id,
        user: new ObjectId(user._id),
        payment_id: paymentIntent.id,
        payment_method: paymentIntent.payment_method_types,
        payment_amount: convertCentsToDollars(paymentIntent?.amount),
        payment_currency: paymentIntent.currency,
        payment_object: paymentIntent.object,
        payment_created: convertToIsoDate(paymentIntent.created),
        status: paymentIntent.status,
        custom_offer: customOfferData?._id,
      };

      const counter: any = await CounterSvc.generateCounter({ type: CounterType.BOOKING });
      const current_date = new Date();
      const year = current_date.getFullYear().toString();
      const counterValue = counter.count.toString().padStart(3, "0");
      const bookingReference = `REF-${counterValue}-${year}`;

      const bookingData = {
        _id: new ObjectId(),
        booker: venue_owner,
        booked_user: enquiry.user?._id,
        space: customOfferData.space?._id,
        venue: customOfferData.venue?._id,
        start_date: IS_BOOKING_MICROSERVICES
          ? new Date(customOfferData.date.timestamp.start_date_time).toISOString()
          : new Date(customOfferData.date.timestamp.start_date_time),
        end_date: IS_BOOKING_MICROSERVICES
          ? new Date(customOfferData.date.timestamp.end_date_time).toISOString()
          : new Date(customOfferData.date.timestamp.end_date_time),
        total_guest: customOfferData.guests,
        total_price: customOfferData.rental_amount,
        status: booking_status.PENDING,
        booking_reference: bookingReference,
        enquiry: enquiryId,
      };

      const stripeAccount = await StripeAccountSvc.getAccount({ user: enquiry.venue.user._id });

      const accountPaymentTransactionPayload: any = {
        stripe_account: stripeAccount?._id,
        payment: paymentId,
        enquiry: enquiry._id,
        venue: enquiry.venue._id,
        venue_owner: enquiry.venue.user._id,
        space: enquiry.space._id,
        amount: convertCentsToDollars(paymentIntent.amount) - convertCentsToDollars(paymentIntent.amount) * 0.15,
      };

      const counter_receipt = await CounterSvc.generateCounter({ type: CounterType.RECEIPT });
      const counterValueReceipt = counter_receipt.count.toString().padStart(3, "0");
      const receiptNo = `REC-${counterValueReceipt}-${year}`;

      const results: any = await Promise.allSettled([
        PaymentSvc.createPayment(payment),
        BookingSvc.createBooking(bookingData),
        EnquirySvc.updateEnquiry({ _id: enquiryId }, { status: enquiry_status.PAYMENT_IN_PROGRESS }),
        CustomeOfferSvc.updateCustomOffer(customOfferData?._id, { status: offer_status.PAYMENT_IN_PROGRESS, booking: bookingData._id }, null),
        initReceiptQueueProcess({
          receipt_no: receiptNo,
          user: enquiry.user,
          custom_offer: customOfferData,
          enquiry,
          bookingReference,
        }),
        StripeAccountTransactionSvc.createAccount(accountPaymentTransactionPayload),
      ]);

      payment_id = results[0]?.value?.insertedId;
      booking_id = results[1]?.value?.insertedId;
    }, useTransactionOptions);

    const result = { payment: true, id: client_secret, payment_id, booking_id };
    return result;
  }

  static async computePayment(payload: any, space: any, pricing: any) {
    const { date, time_start, time_end, guests } = payload;

    const [venue]: any = await VenueSvc.getVenue({ _id: new ObjectId(space.venue) });

    const country = venue?.address?.country || "SG";
    const [country_settings] = await CountrySettingSvc.getCountrySetting({ cca2: country });
    const rebate = country_settings?.rebate || 0;

    const startDate = new Date(formatDateTimeToIso(`${date} ${time_start}`));
    const endDate = new Date(formatDateTimeToIso(`${date} ${time_end}`));

    if (endDate < startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const dayOfWeek = startDate.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
    const timeDifference = endDate.getTime() - startDate.getTime();
    const hours = timeDifference / (1000 * 60 * 60);
    let totalPrice = 0;
    let cleaningFee = 0;
    let computationUsed = "";
    let type = "HIRE_FEE";
    let duration = "";
    let base_rate = "";

    if (pricing.selected_pricing === "HIRE_FEE") {
      if (pricing.cleaning_fee) cleaningFee = Number(pricing.cleaning_fee);
      const dayPricing = pricing.hire_fee.days.find((day: any) => day.name === dayOfWeek);

      let fullDayDuration = 12;
      if (dayPricing.full_day_hours) {
        fullDayDuration = Number(dayPricing.full_day_hours);
      }

      if (dayPricing && dayPricing.hourlyCheckBox) {
        totalPrice = hours * Number(dayPricing.slots.rate);
        computationUsed = "PER_HOUR";
        base_rate = dayPricing.slots.rate.toString();
      }

      if (dayPricing && dayPricing.full_day_rate && dayPricing.fullRateCheckkBox) {
        totalPrice = Number(dayPricing.full_day_rate);
        computationUsed = "PER_DAY";
        base_rate = dayPricing.full_day_rate.toString();
      }

      if (dayPricing && dayPricing.full_day_rate && dayPricing.hourlyCheckBox && hours < fullDayDuration) {
        totalPrice = hours * Number(dayPricing.slots.rate);
        computationUsed = "PER_HOUR";
        base_rate = dayPricing.slots.rate.toString();
      }

      if (dayPricing && dayPricing.full_day_rate && dayPricing.hourlyCheckBox && hours >= fullDayDuration) {
        totalPrice = Number(dayPricing.full_day_rate);
        computationUsed = "PER_DAY";
        base_rate = dayPricing.full_day_rate.toString();
      }
    } else if (pricing.selected_pricing === "CUSTOM_PRICE") {
      const priceDetails = pricing.custom_price.prices.filter((price: any) => {
        return price.weekdays.includes(dayOfWeek);
      });

      priceDetails.forEach((price: any) => {
        const priceStartTime = new Date(`${date.split("/").reverse().join("-")}T${price.time.from}:00`);
        const priceEndTime = new Date(`${date.split("/").reverse().join("-")}T${price.time.to}:00`);

        if (priceStartTime < endDate && priceEndTime > startDate) totalPrice += price.price;

        type = "CUSTOM_PRICE";
        duration = priceDetails[0].duration;
        computationUsed = priceDetails[0].type;
        base_rate = priceDetails[0].price.toString();
      });
    }

    let commission_fee = 0.15,
      platform_fee = 0;

    // if (country_settings && venue.commission) {
    //   commission_fee = parseFloat(venue.commission);
    //   platform_fee = parseFloat(rebate);
    // }

    if (venue.payment_method === "SUBSCRIPTION") {
      commission_fee = 0;
      platform_fee = parseFloat(rebate);
    } else if (venue.payment_method === "COMMISSION" && country_settings && venue.commission) {
      commission_fee = parseFloat(venue.commission);
      platform_fee = parseFloat(rebate);
    }

    const userRoleComputed = {
      base_rate: base_rate,
      subtotal: totalPrice.toFixed(2),
      rebate: platform_fee,
      grand_total: (totalPrice + cleaningFee - totalPrice * platform_fee).toFixed(2),
      cleaning_fee: cleaningFee,
    };

    const venueRoleComputation = {
      base_rate: base_rate,
      subtotal: totalPrice.toFixed(2),
      commission_fee,
      grand_total: (totalPrice + cleaningFee - totalPrice * commission_fee).toFixed(2),
      cleaning_fee: cleaningFee,
    };

    const results = {
      date,
      from: time_start,
      to: time_end,
      payment_computation: {
        user: userRoleComputed,
        venue: venueRoleComputation,
      },
      guests,
      currency: pricing.currency,
      computation_used: computationUsed,
      type: type,
      ...(type !== "HIRE_FEE" && { duration }),
    };

    return results;
  }

  static async processPaymentStatus(payload: any) {
    const { payment_id, booking_id, status } = payload;

    let booking;
    if (IS_BOOKING_MICROSERVICES) {
      ({ booking: booking } = await BookingSvc.fetchBookingsFromMicroservices({ booking_id: booking_id, page: 1, limit: 1 }));
    } else {
      booking = await BookingSvc.getBookings({ _id: new ObjectId(booking_id) }, 0, 1);
    }
    const [bookingData] = booking;
    const [spaceData] = await SpaceSvc.getPaginatedSpaces({ query: { _id: bookingData.space_id }, skip: 0, limit: 1, user_id: null });

    let enquiryData = null;
    const enquiry_id = bookingData.enquiry;
    if (IS_ENQUIRY_MICROSERVICES) {
      const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ enquiry_id });
      [enquiryData] = enquiries;
    } else {
      [enquiryData] = await EnquirySvc.getEnquiries({ _id: new ObjectId(enquiry_id) }, 0, 1);
    }

    const [custom_offer] = await CustomeOfferSvc.getCustomOffer({ enquiry_id: enquiryData._id });

    const mongoClient = useMongoClient();
    const session = mongoClient.startSession();

    const paymentQuery = { _id: new ObjectId(payment_id) };
    let update_status = null;

    const payment: any = await PaymentSvc.getPayment(paymentQuery);
    if (!payment) {
      return { error: "Payment not found" };
    }

    const start_event_date = new Date(bookingData.start_date).toLocaleDateString("en-GB");
    const start_event_time = extractTime(bookingData.start_date);
    const end_event_time = extractTime(bookingData.end_date);

    const current_date = new Date();
    const year = current_date.getFullYear().toString();

    const counter: any = await CounterSvc.generateCounter({ type: CounterType.BOOKING });
    const counterValue = counter.count.toString().padStart(3, "0");
    const bookingReference = `REF-${counterValue}-${year}`;

    const counter_receipt = await CounterSvc.generateCounter({ type: CounterType.RECEIPT });
    const counterValueReceipt = counter_receipt.count.toString().padStart(3, "0");
    const receiptNo = `REC-${counterValueReceipt}-${year}`;

    switch (status) {
      case "succeeded":
        update_status = "PAID";
        break;
      case "failed":
        update_status = "PAYMENT_FAILED";
        break;
      default:
        return { error: "Invalid payment status" };
    }

    await session.withTransaction(async () => {
      if (update_status === "PAID") {
        const [accountStripeTransaction]: any = await StripeAccountTransactionSvc.getAccount({
          payment: payment._id,
          // status: account_transcation_status.COMPLETED,
        });

        logger.log({
          level: "info",
          message: `[FUND_TRANSFER_PAYMENT]: ${accountStripeTransaction}`,
        });

        if (accountStripeTransaction) {
          let transfer_status = account_transcation_status.COMPLETED;
          let recurring = false;
          const amount = convertDollarsToCents(accountStripeTransaction.amount);
          const currency = payment.payment_currency;
          const stripe_account = accountStripeTransaction?.stripe_account?.stripe_account_id;
          logger.log({
            level: "info",
            message: `[PAYMENT_STATUS]: ${stripe_account}`,
          });
          if (stripe_account) {
            const transferFunds: { error: Boolean; message: string; data?: any } = await createTransfer(stripe_account, amount, currency);
            logger.log({
              level: "info",
              message: `[PAYMENT_STATUS]: ${transferFunds}`,
            });
            if (transferFunds.error) {
              transfer_status = account_transcation_status.FAILED;
              recurring = true;
            }
            await StripeAccountTransactionSvc.updateAccount(
              {
                _id: accountStripeTransaction._id,
              },
              { status: transfer_status, updatedAt: new Date(), message: transferFunds.message, recurring },
            );
          }
        } else {
          logger.log({
            level: "info",
            message: `[FUND_TRANSFER_PAYMENT]: No No Stripe account associated`,
          });
          await StripeAccountTransactionSvc.updateAccount(
            {
              _id: accountStripeTransaction._id,
            },
            { status: "FAILED", updatedAt: new Date(), message: "No Stripe account associated", recurring: true },
          );
        }
      }
      await Promise.allSettled([
        sendTemplatedEmail({
          subject: `Venue4Use: Booking Confirmed`,
          email_data: {
            first_name: enquiryData.user.first_name.replace(/_/g, " "),
            last_name: enquiryData.user.last_name.replace(/_/g, " "),
            space_name: spaceData.name.replace(/_/g, " "),
            event_type: enquiryData ? enquiryData.type.replace(/_/g, " ") : null,
            event_date: start_event_date.replace(/_/g, " "),
            start_time_event: start_event_time.replace(/_/g, " "),
            end_time_event: end_event_time.replace(/_/g, " "),
            number_of_guests: bookingData.total_guest,
            street: spaceData.venue.address.street.replace(/_/g, " "),
            city: spaceData.venue.address.city.replace(/_/g, " "),
            state: spaceData.venue.address.state.replace(/_/g, " "),
            country: spaceData.venue.address.country.replace(/_/g, " "),
            postal_code: spaceData.venue.address.postal_code.replace(/_/g, " "),
            booking_reference: bookingData.booking_reference.replace(/_/g, " "),
            venue_name: spaceData.venue.name.replace(/_/g, " "),
            email: enquiryData.user.email.replace(/_/g, " "),
          },
          template_name: "booking-confirmed.html",
        }),
        initReceiptQueueProcess({
          receipt_no: receiptNo,
          user: enquiryData.user,
          custom_offer,
          enquiry: enquiryData,
          bookingReference,
        }),
        EnquirySvc.updateEnquiry(
          { _id: payment.enquiry },
          { status: update_status === "PAID" ? enquiry_status.BOOKING_CONFIRMED : enquiry_status.PAYMENT_FAILED },
        ),
        PaymentSvc.updatePayment(paymentQuery, { status: update_status, updatedAt: new Date() }),
        CustomeOfferSvc.updateCustomOffer(
          payment?.custom_offer,
          {
            status: update_status === "PAID" ? offer_status.BOOKING_CONFIRMED : offer_status.PAYMENT_FAILED,
            booking: new ObjectId(booking_id),
            updatedAt: new Date(),
          },
          null,
        ),
        BookingSvc.updateBooking(new ObjectId(booking_id), {
          status: update_status === "PAID" ? booking_status.CONFIRMED : booking_status.PAYMENT_FAILED,
          updatedAt: new Date(),
        }),
      ]);
    }, useTransactionOptions);
    return { payment: true };
  }

  static async createAccount(payload: any, userStripeAccount: any, user: any, tenant?: any) {
    const { user_id, country = "SG" } = payload;

    if (userStripeAccount && userStripeAccount.stripe_account_id && userStripeAccount.status === account_status.PENDING) {
      const retrievedAccount: any = await retriveAccount(userStripeAccount.stripe_account_id, tenant);
      if (retrievedAccount) {
        await StripeAccountSvc.deleteAccount({ _id: userStripeAccount._id });
        await deleteAccount(userStripeAccount?.stripe_account_id);
      }
    }

    const results: any = await createAccount({ country, email: user?.email, tenant });

    const stripeAccountId = new ObjectId();

    await StripeAccountSvc.createAccount({
      _id: stripeAccountId,
      user: new ObjectId(user_id as string),
      stripe_account_id: results.account_id,
    });

    //patch the stripe account transaction stripe_acccount fields when newly onboarding
    const existingAccountTransaction = await StripeAccountTransactionSvc.getAccount({ venue_owner: new ObjectId(user_id as string) });
    if (existingAccountTransaction) {
      await StripeAccountTransactionSvc.updateManyPaymentTransaction(
        { venue_owner: new ObjectId(user_id as string) },
        { stripe_account: stripeAccountId },
      );
    }
    return results;
  }
}

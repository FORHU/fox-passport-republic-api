import { randomBytes } from "crypto";

import ReceiptSvc from "../../../services/receipt.service";
import { uploadPdfFileTos3 } from "../../aws";
import { convertToPDF, createCurrencyFormatter, formatDate, getHTMLContents, getVenueLocation, sendTemplatedEmail } from "../../helpers";
import { createQueue } from "../index";

const receiptQueue = createQueue("receiptQueue");

receiptQueue.process("process_receipt", async (job: any) => {
  console.log("process_receipt queue");
  try {
    const sgdFormatter = createCurrencyFormatter("en-SG", "SGD");
    const { receipt_no, user, custom_offer, enquiry, bookingReference } = job.data;

    const payload = {
      receipt_no,
      customer: user?._id,
      receipt_date: new Date(),
      subtotal: custom_offer.user_computation.subtotal,
      taxes: 0.12,
      rebate: custom_offer.user_computation.rebate,
      total_amount: custom_offer.user_computation.grand_total,
      currency: custom_offer.currency || "SGD",
    };

    const receipt: any = await ReceiptSvc.createReceipt(payload);

    const htmlContent = getHTMLContents({
      template_name: "receipt-template.html",
      email_data: {
        space_name: custom_offer?.space?.name,
        venue_location: getVenueLocation(custom_offer.venue),
        venue_country: custom_offer.venue.address.country,
        venue_postal: custom_offer.venue.address.postal_code,
        receipt_date: formatDate(receipt.createdAt),
        receipt_no: receipt.receipt_no,
        booker_user: `${user?.first_name} ${user?.last_name}`,
        quantity: 1,
        price: sgdFormatter.format(custom_offer.user_computation.subtotal),
        rebate: `${parseFloat(custom_offer.user_computation.rebate) * 100}%`,
        grand_total: sgdFormatter.format(parseFloat(custom_offer.user_computation.grand_total)),
        email: user.email,
      },
    });

    const pdfBuffer = await convertToPDF(htmlContent);
    let uploadFiles: any = null;
    if (pdfBuffer) {
      const key = `invoice/${receipt_no}.pdf`;
      uploadFiles = await uploadPdfFileTos3(pdfBuffer, key);
    }

    const fileAttachments = [];
    if (uploadFiles) {
      fileAttachments.push({
        filename: `${receipt_no}.pdf`,
        path: uploadFiles.Location,
        contentType: "application/pdf",
      });
    }

    // sendTemplatedEmail({
    //   subject: `Venue4Use: Booking Confirmed`,
    //   email_data: {
    //     email: enquiry.user?.email,
    //     space_name: enquiry.space?.name,
    //     first_name: enquiry.user?.first_name,
    //     last_name: enquiry.user?.last_name,
    //     event_type: enquiry.type,
    //     event_date: custom_offer.date.date,
    //     start_time_event: custom_offer.date.from,
    //     end_time_event: custom_offer.date.to,
    //     number_of_guests: custom_offer.guests,
    //     street: enquiry.venue?.address?.street,
    //     city: enquiry.venue?.address?.city,
    //     state: enquiry.venue?.address?.state,
    //     country: enquiry.venue?.address?.country,
    //     postal_code: enquiry.venue?.address?.postal_code,
    //     venue_name: enquiry.venue?.name,
    //     booking_reference: bookingReference,
    //   },
    //   template_name: "booking-confirmed.html",
    //   attachments: fileAttachments,
    // });
  } catch (error) {
    console.log(error);
  }
});

export const initReceiptQueueProcess = async (data: any) => {
  const buffer = randomBytes(16);
  const jobId = buffer.toString("hex");
  const repeatableJobs = await receiptQueue.getRepeatableJobs();
  const jobExists = repeatableJobs.some((job) => job.id === jobId);
  if (!jobExists) {
    receiptQueue.add("process_receipt", data, { jobId });
    console.log("Receipt processing job scheduled.");
  } else {
    console.log("Receipt processing job already scheduled.");
  }
};

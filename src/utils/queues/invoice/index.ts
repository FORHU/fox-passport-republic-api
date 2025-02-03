import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";

import { InvoiceStatus } from "../../../models/invoice.model";
import CustomOfferSvc from "../../../services/custom-offer.service";
import InvoiceSvc from "../../../services/invoice.service";
import { uploadPdfFileTos3 } from "../../aws";
import {
  convertToPDF,
  createCurrencyFormatter,
  formatDate,
  getHTMLContents,
  getVenueCountry,
  getVenueLocation,
  sendTemplatedEmail,
} from "../../helpers";
import { createQueue } from "../index";

export const invoiceQueue = createQueue("invoiceQueue1");

invoiceQueue.process("process_invoices", async (job: any) => {
  const sgdFormatter = createCurrencyFormatter("en-SG", "SGD");
  const { invoice_no, user, offer } = job.data;
  const newInvoice = await InvoiceSvc.createInvoice({
    invoice_no,
    customer: user._id,
    subtotal: offer.user_computation.subtotal,
    rebate: parseFloat(offer.user_computation.rebate),
    total_amount: parseFloat(offer.user_computation.grand_total),
    status: InvoiceStatus.SENT,
    notes: `ACCEPTED OFFER`,
    currency: "SGD",
  });

  const invoice: any = await InvoiceSvc.getInvoice({
    _id: newInvoice.insertedId,
  });

  const email_data = {
    space_name: offer?.space?.name,
    venue_location: getVenueLocation(offer.venue),
    venue_country: getVenueCountry(offer.venue.address.country),
    venue_postal: offer.venue.address.postal_code,
    invoice_date: formatDate(invoice.createdAt),
    invoice_no: invoice.invoice_no,
    booker_user: `${user?.first_name} ${user?.last_name}`,
    quantity: 1,
    price: sgdFormatter.format(offer.user_computation.subtotal),
    rebate: `${parseFloat(offer.user_computation.rebate) * 100}%`,
    grand_total: sgdFormatter.format(parseFloat(offer.user_computation.grand_total)),
    email: user.email,
  };

  const htmlContent = getHTMLContents({
    template_name: "invoice-template.html",
    email_data,
  });

  const pdfBuffer = await convertToPDF(htmlContent);
  let uploadFiles: any = null;
  if (pdfBuffer) {
    const key = `invoice/${invoice.invoice_no}.pdf`;
    uploadFiles = await uploadPdfFileTos3(pdfBuffer, key);
  }

  const fileAttachments = [];
  if (uploadFiles) {
    await Promise.allSettled([
      await InvoiceSvc.updateInvoice({ _id: invoice._id }, { invoice_url: uploadFiles.Location, invoice_data: email_data }),
      await CustomOfferSvc.updateCustomOffer(new ObjectId(offer._id), { invoice: invoice._id }, null),
    ]);
    fileAttachments.push({
      filename: `${invoice.invoice_no}.pdf`,
      path: uploadFiles.Location,
      contentType: "application/pdf",
    });
  }

  sendTemplatedEmail({
    subject: `Venue4Use: Invoice # ${invoice.invoice_no}`,
    email_data: {
      invoice_date: formatDate(),
      first_name: user.first_name,
      email: user.email,
    },
    template_name: "send-invoice.html",
    attachments: fileAttachments,
  });
});

export const initInvoiceQueueProcess = async (data: any) => {
  const buffer = randomBytes(16);
  const jobId = buffer.toString("hex");
  const repeatableJobs = await invoiceQueue.getRepeatableJobs();
  const jobExists = repeatableJobs.some((job) => job.id === jobId);
  if (!jobExists) {
    invoiceQueue.add("process_invoices", data, { jobId });
    console.log("Enquiry processing job scheduled.");
  } else {
    console.log("Enquiry processing job already scheduled.");
  }
};

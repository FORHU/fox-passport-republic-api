const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

try {
  // Array of email template file names
  const emailTemplates = [
    "admin-invite.html",
    "admin-space-deletion-approval.html",
    "account-recovery.html",
    "approval-notification.html",
    "booking-confirmed.html",
    "booking-cancelled.html",
    "booking-declined.html",
    "booking-requested.html",
    "booking-withdrawn.html",
    "email-verification.html",
    "enquiry-status.html",
    "insufficient-funds.html",
    "invoice-template.html",
    "new-message-notification.html",
    "password-reset.html",
    "receipt-template.html",
    "send-invoice.html",
    "setup-stripe-account.html",
    "space-approval-notification.html",
    "space-approved.html",
    "space-declined.html",
    "space-for-approval.html",
    "space-suspension.html",
    "team-member-invite.html",
    "venue-approved.html",
    "venue-declined.html",
    "venue-deletion-request.html",
    "venue-for-approval.html",
    "venue-suspension.html",
    "space-deletion-request.html",
    "request-venue-transfer-owner.html",
  ];

  const protoTemplates = [
    "create-booking.proto",
    "create-enquiry.proto",
    "delete-booking.proto",
    "email.proto",
    "enquiry.proto",
    "existing-booking-details.proto",
    "existing-booking.proto",
    "get-booking.proto",
    "payment.proto",
    "stripe-account.proto",
    "update-booking.proto",
    "get-enquiry.proto",
    "update-enquiry.proto",
  ];

  //const emailTemplateDir = path.join(__dirname, "../dist/src/utils/email-template");

  const protoDir = path.join(__dirname, "../dist/src/proto");

  // if (!fs.existsSync(emailTemplateDir)) {
  //   fs.mkdirSync(emailTemplateDir, { recursive: true });
  // }

  if (!fs.existsSync(protoDir)) {
    fs.mkdirSync(protoDir, { recursive: true });
  }

  // emailTemplates.forEach((template) => {
  //   execSync(`cp src/utils/email-template/${template} dist/src/utils/email-template/${template}`);
  // });

  protoTemplates.forEach((template) => {
    execSync(`cp src/proto/${template} dist/src/proto/${template}`);
  });

  console.log("Email templates copied successfully.");
} catch (error) {
  console.error("Error copying email templates:", error);
  process.exit(1);
}

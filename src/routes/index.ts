import express from "express";

import { getVersionString } from "../utils/generate-version";
import adminRoutes from "./admin.route";
import authRoutes from "./auth.route";
import bookingRoutes from "./booking.routes";
import cancellationPolicyRoutes from "./cancellation-policy.route";
import countrySettingRoutes from "./country-setting.route";
import customOfferRoutes from "./custom-offer.route";
import enquiriesRoutes from "./enquiries.route";
import favoriteRoutes from "./favorite.route";
import filesRoutes from "./files.route";
import invoiceRoutes from "./invoice.route";
import keywordRoutes from "./keywords.route";
import messageRoutes from "./message-inbox.route";
import messageTemplateRoutes from "./message-template.route";
import organizationRoutes from "./organization-member.route";
import paymentRoutes from "./payment.route";
import paymentTransaction from "./payment-transaction.route";
import ratingRoutes from "./rating.route";
import receiptRoutes from "./receipt.route";
import requestsRoutes from "./requests.route";
import salesSettingRoutes from "./setting.route";
import spaceRoutes from "./space.route";
import subscriptionRoutes from "./subscription.route";
import todoRoutes from "./todo.route";
import userRoutes from "./user.route";
import AuthV2Routes from "./v2-routes/auth.routes";
import venueRoutes from "./venue.route";
import spaceV2Routes from "./v2-routes/space.route";

const router = express.Router();

router.use("/v1/todo", todoRoutes);
router.use("/v1/auth", authRoutes);
router.use("/v1/enquiries", enquiriesRoutes);
router.use("/v1/user", userRoutes);
router.use("/v1/venue", venueRoutes);
router.use("/v1/keywords", keywordRoutes);
router.use("/v1/space", spaceRoutes);
router.use("/v1/bookings", bookingRoutes);
router.use("/v1/files", filesRoutes);
router.use("/v1/message-inbox", messageRoutes);
router.use("/v1/custom-offer", customOfferRoutes);
router.use("/v1/favorite", favoriteRoutes);
router.use("/v1/cancellation-policy", cancellationPolicyRoutes);
router.use("/v1/organization", organizationRoutes);
router.use("/v1/inbox", messageRoutes);
router.use("/v1/payment", paymentRoutes);
router.use("/v1/admin", adminRoutes);
router.use("/v1/invoice", invoiceRoutes);
router.use("/v1/receipt", receiptRoutes);
router.use("/v1/message-template", messageTemplateRoutes);
router.use("/v1/requests", requestsRoutes);
router.use("/v1/country-settings", countrySettingRoutes);
router.use("/v1/payment-transaction", paymentTransaction);
router.use("/v1/rating", ratingRoutes);
router.use("/v1/subscription", subscriptionRoutes);
router.use("/v1/setting", salesSettingRoutes);
router.use("/v2/auth", AuthV2Routes);
router.use("/v2/space", spaceV2Routes)

router.get("/v1/healthcheck", (_, res) => {
  res.json({
    health_check: "success",
    version: getVersionString(),
  });
});

export default router;

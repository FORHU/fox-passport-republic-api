-- Rename 26 tables to the snake_case-plural convention the other 16 already use.
--
-- Written by hand. `prisma migrate diff` cannot express a rename: it emits
-- DROP TABLE + CREATE TABLE, which would discard every row in these tables.
-- See docs/adr/0003-schema-split-by-domain.md.

-- Badge -> badges
ALTER TABLE "Badge" RENAME TO "badges";
ALTER TABLE "badges" RENAME CONSTRAINT "Badge_pkey" TO "badges_pkey";
ALTER INDEX "Badge_name_key" RENAME TO "badges_name_key";

-- Booking -> bookings
ALTER TABLE "Booking" RENAME TO "bookings";
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_eventId_fkey" TO "bookings_eventId_fkey";
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_pkey" TO "bookings_pkey";
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_userId_fkey" TO "bookings_userId_fkey";
ALTER INDEX "Booking_stripePaymentId_key" RENAME TO "bookings_stripePaymentId_key";
ALTER INDEX "Booking_ticketCode_key" RENAME TO "bookings_ticketCode_key";

-- BookingAttendee -> booking_attendees
ALTER TABLE "BookingAttendee" RENAME TO "booking_attendees";
ALTER TABLE "booking_attendees" RENAME CONSTRAINT "BookingAttendee_bookingId_fkey" TO "booking_attendees_bookingId_fkey";
ALTER TABLE "booking_attendees" RENAME CONSTRAINT "BookingAttendee_invitedById_fkey" TO "booking_attendees_invitedById_fkey";
ALTER TABLE "booking_attendees" RENAME CONSTRAINT "BookingAttendee_pkey" TO "booking_attendees_pkey";
ALTER TABLE "booking_attendees" RENAME CONSTRAINT "BookingAttendee_userId_fkey" TO "booking_attendees_userId_fkey";
ALTER INDEX "BookingAttendee_ticketCode_key" RENAME TO "booking_attendees_ticketCode_key";

-- CancellationRule -> cancellation_rules
ALTER TABLE "CancellationRule" RENAME TO "cancellation_rules";
ALTER TABLE "cancellation_rules" RENAME CONSTRAINT "CancellationRule_pkey" TO "cancellation_rules_pkey";
ALTER TABLE "cancellation_rules" RENAME CONSTRAINT "CancellationRule_policyId_fkey" TO "cancellation_rules_policyId_fkey";

-- Event -> events
ALTER TABLE "Event" RENAME TO "events";
ALTER TABLE "events" RENAME CONSTRAINT "Event_clientId_fkey" TO "events_clientId_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "Event_organizerId_fkey" TO "events_organizerId_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "Event_pkey" TO "events_pkey";
ALTER TABLE "events" RENAME CONSTRAINT "Event_templateId_fkey" TO "events_templateId_fkey";

-- EventAssetTransaction -> event_asset_transactions
ALTER TABLE "EventAssetTransaction" RENAME TO "event_asset_transactions";
ALTER TABLE "event_asset_transactions" RENAME CONSTRAINT "EventAssetTransaction_assetId_fkey" TO "event_asset_transactions_assetId_fkey";
ALTER TABLE "event_asset_transactions" RENAME CONSTRAINT "EventAssetTransaction_bookingId_fkey" TO "event_asset_transactions_bookingId_fkey";
ALTER TABLE "event_asset_transactions" RENAME CONSTRAINT "EventAssetTransaction_eventId_fkey" TO "event_asset_transactions_eventId_fkey";
ALTER TABLE "event_asset_transactions" RENAME CONSTRAINT "EventAssetTransaction_pkey" TO "event_asset_transactions_pkey";
ALTER TABLE "event_asset_transactions" RENAME CONSTRAINT "EventAssetTransaction_providerId_fkey" TO "event_asset_transactions_providerId_fkey";
ALTER INDEX "EventAssetTransaction_stripeTransferId_key" RENAME TO "event_asset_transactions_stripeTransferId_key";

-- EventFoxerApplication -> event_foxer_applications
ALTER TABLE "EventFoxerApplication" RENAME TO "event_foxer_applications";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_birPermitFileId_fkey" TO "event_foxer_applications_birPermitFileId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_nbiFileId_fkey" TO "event_foxer_applications_nbiFileId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_pkey" TO "event_foxer_applications_pkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_portfolioFileId_fkey" TO "event_foxer_applications_portfolioFileId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_requestId_fkey" TO "event_foxer_applications_requestId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_selfieFileId_fkey" TO "event_foxer_applications_selfieFileId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_tinIdFileId_fkey" TO "event_foxer_applications_tinIdFileId_fkey";
ALTER TABLE "event_foxer_applications" RENAME CONSTRAINT "EventFoxerApplication_validId1FileId_fkey" TO "event_foxer_applications_validId1FileId_fkey";
ALTER INDEX "EventFoxerApplication_requestId_key" RENAME TO "event_foxer_applications_requestId_key";

-- EventServiceTransaction -> event_service_transactions
ALTER TABLE "EventServiceTransaction" RENAME TO "event_service_transactions";
ALTER TABLE "event_service_transactions" RENAME CONSTRAINT "EventServiceTransaction_bookingId_fkey" TO "event_service_transactions_bookingId_fkey";
ALTER TABLE "event_service_transactions" RENAME CONSTRAINT "EventServiceTransaction_eventId_fkey" TO "event_service_transactions_eventId_fkey";
ALTER TABLE "event_service_transactions" RENAME CONSTRAINT "EventServiceTransaction_pkey" TO "event_service_transactions_pkey";
ALTER TABLE "event_service_transactions" RENAME CONSTRAINT "EventServiceTransaction_providerId_fkey" TO "event_service_transactions_providerId_fkey";
ALTER TABLE "event_service_transactions" RENAME CONSTRAINT "EventServiceTransaction_serviceId_fkey" TO "event_service_transactions_serviceId_fkey";
ALTER INDEX "EventServiceTransaction_stripeTransferId_key" RENAME TO "event_service_transactions_stripeTransferId_key";

-- EventTemplate -> event_templates
ALTER TABLE "EventTemplate" RENAME TO "event_templates";
ALTER TABLE "event_templates" RENAME CONSTRAINT "EventTemplate_cancellationPolicyId_fkey" TO "event_templates_cancellationPolicyId_fkey";
ALTER TABLE "event_templates" RENAME CONSTRAINT "EventTemplate_ownerId_fkey" TO "event_templates_ownerId_fkey";
ALTER TABLE "event_templates" RENAME CONSTRAINT "EventTemplate_pkey" TO "event_templates_pkey";

-- EventVenueTransaction -> event_venue_transactions
ALTER TABLE "EventVenueTransaction" RENAME TO "event_venue_transactions";
ALTER TABLE "event_venue_transactions" RENAME CONSTRAINT "EventVenueTransaction_bookingId_fkey" TO "event_venue_transactions_bookingId_fkey";
ALTER TABLE "event_venue_transactions" RENAME CONSTRAINT "EventVenueTransaction_eventId_fkey" TO "event_venue_transactions_eventId_fkey";
ALTER TABLE "event_venue_transactions" RENAME CONSTRAINT "EventVenueTransaction_pkey" TO "event_venue_transactions_pkey";
ALTER TABLE "event_venue_transactions" RENAME CONSTRAINT "EventVenueTransaction_providerId_fkey" TO "event_venue_transactions_providerId_fkey";
ALTER TABLE "event_venue_transactions" RENAME CONSTRAINT "EventVenueTransaction_venueId_fkey" TO "event_venue_transactions_venueId_fkey";
ALTER INDEX "EventVenueTransaction_stripeTransferId_key" RENAME TO "event_venue_transactions_stripeTransferId_key";

-- Favorite -> favorites
ALTER TABLE "Favorite" RENAME TO "favorites";
ALTER TABLE "favorites" RENAME CONSTRAINT "Favorite_pkey" TO "favorites_pkey";
ALTER TABLE "favorites" RENAME CONSTRAINT "Favorite_userId_fkey" TO "favorites_userId_fkey";

-- File -> files
ALTER TABLE "File" RENAME TO "files";
ALTER TABLE "files" RENAME CONSTRAINT "File_assetId_fkey" TO "files_assetId_fkey";
ALTER TABLE "files" RENAME CONSTRAINT "File_pkey" TO "files_pkey";
ALTER TABLE "files" RENAME CONSTRAINT "File_serviceId_fkey" TO "files_serviceId_fkey";
ALTER TABLE "files" RENAME CONSTRAINT "File_templateId_fkey" TO "files_templateId_fkey";
ALTER TABLE "files" RENAME CONSTRAINT "File_uploadedBy_fkey" TO "files_uploadedBy_fkey";
ALTER TABLE "files" RENAME CONSTRAINT "File_venueId_fkey" TO "files_venueId_fkey";

-- FoxerSpecialization -> foxer_specializations
ALTER TABLE "FoxerSpecialization" RENAME TO "foxer_specializations";
ALTER TABLE "foxer_specializations" RENAME CONSTRAINT "FoxerSpecialization_pkey" TO "foxer_specializations_pkey";
ALTER TABLE "foxer_specializations" RENAME CONSTRAINT "FoxerSpecialization_userId_fkey" TO "foxer_specializations_userId_fkey";
ALTER INDEX "FoxerSpecialization_roleType_category_idx" RENAME TO "foxer_specializations_roleType_category_idx";
ALTER INDEX "FoxerSpecialization_userId_roleType_category_key" RENAME TO "foxer_specializations_userId_roleType_category_key";

-- GearFoxerApplication -> gear_foxer_applications
ALTER TABLE "GearFoxerApplication" RENAME TO "gear_foxer_applications";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_birPermitFileId_fkey" TO "gear_foxer_applications_birPermitFileId_fkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_nbiFileId_fkey" TO "gear_foxer_applications_nbiFileId_fkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_pkey" TO "gear_foxer_applications_pkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_requestId_fkey" TO "gear_foxer_applications_requestId_fkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_selfieFileId_fkey" TO "gear_foxer_applications_selfieFileId_fkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_tinIdFileId_fkey" TO "gear_foxer_applications_tinIdFileId_fkey";
ALTER TABLE "gear_foxer_applications" RENAME CONSTRAINT "GearFoxerApplication_validId1FileId_fkey" TO "gear_foxer_applications_validId1FileId_fkey";
ALTER INDEX "GearFoxerApplication_requestId_key" RENAME TO "gear_foxer_applications_requestId_key";

-- InvestorApplication -> investor_applications
ALTER TABLE "InvestorApplication" RENAME TO "investor_applications";
ALTER TABLE "investor_applications" RENAME CONSTRAINT "InvestorApplication_pkey" TO "investor_applications_pkey";
ALTER TABLE "investor_applications" RENAME CONSTRAINT "InvestorApplication_proofFileId_fkey" TO "investor_applications_proofFileId_fkey";
ALTER TABLE "investor_applications" RENAME CONSTRAINT "InvestorApplication_requestId_fkey" TO "investor_applications_requestId_fkey";
ALTER INDEX "InvestorApplication_requestId_key" RENAME TO "investor_applications_requestId_key";

-- Passport -> passports
ALTER TABLE "Passport" RENAME TO "passports";
ALTER TABLE "passports" RENAME CONSTRAINT "Passport_pkey" TO "passports_pkey";
ALTER TABLE "passports" RENAME CONSTRAINT "Passport_userId_fkey" TO "passports_userId_fkey";
ALTER INDEX "Passport_userId_key" RENAME TO "passports_userId_key";

-- PassportPath -> passport_paths
ALTER TABLE "PassportPath" RENAME TO "passport_paths";
ALTER TABLE "passport_paths" RENAME CONSTRAINT "PassportPath_passportId_fkey" TO "passport_paths_passportId_fkey";
ALTER TABLE "passport_paths" RENAME CONSTRAINT "PassportPath_pkey" TO "passport_paths_pkey";
ALTER INDEX "PassportPath_passportId_path_key" RENAME TO "passport_paths_passportId_path_key";

-- PassportStamp -> passport_stamps
ALTER TABLE "PassportStamp" RENAME TO "passport_stamps";
ALTER TABLE "passport_stamps" RENAME CONSTRAINT "PassportStamp_bookingId_fkey" TO "passport_stamps_bookingId_fkey";
ALTER TABLE "passport_stamps" RENAME CONSTRAINT "PassportStamp_passportId_fkey" TO "passport_stamps_passportId_fkey";
ALTER TABLE "passport_stamps" RENAME CONSTRAINT "PassportStamp_pkey" TO "passport_stamps_pkey";
ALTER INDEX "PassportStamp_bookingId_key" RENAME TO "passport_stamps_bookingId_key";

-- Payment -> payments
ALTER TABLE "Payment" RENAME TO "payments";
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_bookingId_fkey" TO "payments_bookingId_fkey";
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_pkey" TO "payments_pkey";
ALTER INDEX "Payment_transactionId_key" RENAME TO "payments_transactionId_key";

-- RefreshToken -> refresh_tokens
ALTER TABLE "RefreshToken" RENAME TO "refresh_tokens";
ALTER TABLE "refresh_tokens" RENAME CONSTRAINT "RefreshToken_pkey" TO "refresh_tokens_pkey";
ALTER TABLE "refresh_tokens" RENAME CONSTRAINT "RefreshToken_userId_fkey" TO "refresh_tokens_userId_fkey";
ALTER INDEX "RefreshToken_expiresAt_idx" RENAME TO "refresh_tokens_expiresAt_idx";
ALTER INDEX "RefreshToken_jti_key" RENAME TO "refresh_tokens_jti_key";
ALTER INDEX "RefreshToken_userId_idx" RENAME TO "refresh_tokens_userId_idx";

-- Review -> reviews
ALTER TABLE "Review" RENAME TO "reviews";
ALTER TABLE "reviews" RENAME CONSTRAINT "Review_bookingId_fkey" TO "reviews_bookingId_fkey";
ALTER TABLE "reviews" RENAME CONSTRAINT "Review_pkey" TO "reviews_pkey";
ALTER TABLE "reviews" RENAME CONSTRAINT "Review_userId_fkey" TO "reviews_userId_fkey";
ALTER INDEX "Review_bookingId_key" RENAME TO "reviews_bookingId_key";
ALTER INDEX "Review_userId_entityId_entityType_idx" RENAME TO "reviews_userId_entityId_entityType_idx";

-- ReviewReply -> review_replies
ALTER TABLE "ReviewReply" RENAME TO "review_replies";
ALTER TABLE "review_replies" RENAME CONSTRAINT "ReviewReply_pkey" TO "review_replies_pkey";
ALTER TABLE "review_replies" RENAME CONSTRAINT "ReviewReply_reviewId_fkey" TO "review_replies_reviewId_fkey";
ALTER TABLE "review_replies" RENAME CONSTRAINT "ReviewReply_userId_fkey" TO "review_replies_userId_fkey";

-- ServiceFoxerApplication -> service_foxer_applications
ALTER TABLE "ServiceFoxerApplication" RENAME TO "service_foxer_applications";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_birPermitFileId_fkey" TO "service_foxer_applications_birPermitFileId_fkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_nbiFileId_fkey" TO "service_foxer_applications_nbiFileId_fkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_pkey" TO "service_foxer_applications_pkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_requestId_fkey" TO "service_foxer_applications_requestId_fkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_selfieFileId_fkey" TO "service_foxer_applications_selfieFileId_fkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_tinIdFileId_fkey" TO "service_foxer_applications_tinIdFileId_fkey";
ALTER TABLE "service_foxer_applications" RENAME CONSTRAINT "ServiceFoxerApplication_validId1FileId_fkey" TO "service_foxer_applications_validId1FileId_fkey";
ALTER INDEX "ServiceFoxerApplication_requestId_key" RENAME TO "service_foxer_applications_requestId_key";

-- User -> users
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER INDEX "User_email_key" RENAME TO "users_email_key";
ALTER INDEX "User_googleId_key" RENAME TO "users_googleId_key";
ALTER INDEX "User_stripeAccountId_key" RENAME TO "users_stripeAccountId_key";
ALTER INDEX "User_stripeCustomerId_key" RENAME TO "users_stripeCustomerId_key";
ALTER INDEX "User_username_key" RENAME TO "users_username_key";

-- UserBadge -> user_badges
ALTER TABLE "UserBadge" RENAME TO "user_badges";
ALTER TABLE "user_badges" RENAME CONSTRAINT "UserBadge_badgeId_fkey" TO "user_badges_badgeId_fkey";
ALTER TABLE "user_badges" RENAME CONSTRAINT "UserBadge_passportId_fkey" TO "user_badges_passportId_fkey";
ALTER TABLE "user_badges" RENAME CONSTRAINT "UserBadge_pkey" TO "user_badges_pkey";
ALTER INDEX "UserBadge_passportId_badgeId_key" RENAME TO "user_badges_passportId_badgeId_key";

-- VenueFoxerApplication -> venue_foxer_applications
ALTER TABLE "VenueFoxerApplication" RENAME TO "venue_foxer_applications";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_birPermitFileId_fkey" TO "venue_foxer_applications_birPermitFileId_fkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_nbiFileId_fkey" TO "venue_foxer_applications_nbiFileId_fkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_pkey" TO "venue_foxer_applications_pkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_requestId_fkey" TO "venue_foxer_applications_requestId_fkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_selfieFileId_fkey" TO "venue_foxer_applications_selfieFileId_fkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_tinIdFileId_fkey" TO "venue_foxer_applications_tinIdFileId_fkey";
ALTER TABLE "venue_foxer_applications" RENAME CONSTRAINT "VenueFoxerApplication_validId1FileId_fkey" TO "venue_foxer_applications_validId1FileId_fkey";
ALTER INDEX "VenueFoxerApplication_requestId_key" RENAME TO "venue_foxer_applications_requestId_key";

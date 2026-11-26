import { Request, Response } from "express";
import RoleRequestService, { retiredRoleError } from "./role-request.service";
import FileSvc from "../file/file.service";
import ProviderSpecialtySvc from "../users/provider-specialty.service";
import { signPrivateFiles } from "../../utils/private-files";
import {
  compactTin,
  DEFAULT_TIN_COUNTRY,
  validateTin,
} from "../../utils/tax-id-formats";
import { normalizePhone } from "../../utils/phone";
import { checkPortfolioUrls } from "../../utils/portfolio-urls";
import {
  applyExperienceClaim,
  checkYearsOfExperience,
} from "../../utils/years-of-experience";
import {
  isPrismaError,
  sendFailure,
  sendServerError,
} from "../../utils/errors";
import { sendValidationError, VALIDATE_ALL } from "../../utils/validation";
import Joi from "joi";
import {
  EventCategory,
  RequestStatus,
  RoleType,
  VenueCategory,
} from "@prisma/client";
import {
  announceAdminQueueChanged,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

// Maps multer field names → application DB column names
const FILE_FIELD_TO_DB_COLUMN: Record<string, string> = {
  validId1: "validId1FileId",
  nbiFile: "nbiFileId",
  tinIdFile: "tinIdFileId",
  birPermitFile: "birPermitFileId",
  selfieFile: "selfieFileId",
  portfolioFile: "portfolioFileId",
  backgroundClearanceFile: "backgroundClearanceFileId", // organizer only
};

// An Organizer's specializations are the kinds of events and venues they have
// helped run, so they draw from both vocabularies.
const ORGANIZER_SPECIALIZATIONS = new Set<string>([
  ...Object.values(EventCategory),
  ...Object.values(VenueCategory),
]);

// The Organizer role exists to vet a person before any Mayor or Event Owner
// can appoint them (docs/adr/0005), so unlike the Foxer roles every identity
// document is required, not optional.
const ORGANIZER_REQUIRED_DOCUMENTS = [
  "validId1FileId",
  "backgroundClearanceFileId",
  "selfieFileId",
] as const;

// A list column the application table requires (`String[]`, no default): a
// client that leaves it out means "none", so it is stored as [] rather than
// reaching Prisma as undefined (api#366). null counts as left out.
const requiredList = (label: string) =>
  Joi.array()
    .items(
      Joi.string()
        .allow("")
        .messages({ "string.base": `Each of the ${label} must be text.` }),
    )
    .empty(null)
    .default([])
    .messages({ "array.base": `${label} must be a list.` });

const requiredText = (label: string) =>
  Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": `${label} is required.`,
      "string.empty": `${label} is required.`,
      "string.base": `${label} must be text.`,
    });

/**
 * The fields each role's application table requires, checked before any
 * document is stored so a missing one gets a field-level 400 instead of a
 * database error. Only columns the database itself requires are listed, so
 * nothing that saved before is refused. A Provider's specialties are checked
 * by ProviderSpecialtySvc, and an Organizer's other fields by
 * validateOrganizerApplication.
 */
const REQUIRED_APPLICATION_FIELDS: Partial<Record<RoleType, Joi.ObjectSchema>> =
  {
    [RoleType.venueFoxer]: Joi.object({
      businessName: requiredText("Business name"),
      contactNumber: requiredText("Contact number"),
      address: requiredText("Address"),
      tinNumber: requiredText("TIN Number"),
      specializations: requiredList("Specializations"),
    }).unknown(true),
    [RoleType.eventFoxer]: Joi.object({
      specializations: requiredList("Specializations"),
    }).unknown(true),
    [RoleType.organizer]: Joi.object({
      specializations: requiredList("Specializations"),
    }).unknown(true),
    [RoleType.investor]: Joi.object({
      // Decimal(12, 2)
      investmentRange: Joi.number()
        .min(0)
        .max(9_999_999_999.99)
        .required()
        .messages({
          "any.required": "Investment range is required.",
          "number.base": "Investment range must be a number.",
          "number.min": "Investment range can't be negative.",
          "number.max": "Investment range is too large.",
        }),
      interests: requiredList("Interests"),
    }).unknown(true),
  };

/**
 * Checks `data` against its role's required fields and fills the defaults in
 * place. Returns the Joi error to answer with, or null.
 */
export function checkRequiredFields(
  roleType: RoleType,
  data: Record<string, unknown>,
): Joi.ValidationError | null {
  const schema = REQUIRED_APPLICATION_FIELDS[roleType];
  if (!schema) return null;
  const { error, value } = schema.validate(data, VALIDATE_ALL);
  if (error) return error;
  Object.assign(data, value);
  return null;
}

/**
 * The `data` field of an application: a JSON string in multipart form-data, or
 * an object in a JSON body. Returns null when it is neither valid JSON nor an
 * object, so the parser's own text never reaches the client.
 */
export function parseApplicationData(
  raw: unknown,
): Record<string, unknown> | null {
  let data: unknown = raw ?? {};
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

export function validateOrganizerApplication(
  data: Record<string, unknown>,
): string | null {
  if (typeof data.bio !== "string" || data.bio.trim().length === 0) {
    return "A short bio is required";
  }
  if (typeof data.location !== "string" || data.location.trim().length === 0) {
    return "Location is required";
  }
  const experience = checkYearsOfExperience(data.experience, true);
  if (!experience.ok) return experience.message;
  data.experience = experience.years;
  // Called once any upload is stored, so the CV is in portfolioFileId.
  const claimError = applyExperienceClaim(data, experience.years);
  if (claimError) return claimError;
  const specializations = data.specializations ?? [];
  if (
    !Array.isArray(specializations) ||
    specializations.some((s) => !ORGANIZER_SPECIALIZATIONS.has(String(s)))
  ) {
    return "Specializations must be event or venue categories";
  }
  const missing = ORGANIZER_REQUIRED_DOCUMENTS.filter(
    (field) => typeof data[field] !== "string" || data[field] === "",
  );
  if (missing.length > 0) {
    return "A valid ID, a background clearance and a selfie are all required";
  }
  return null;
}

/**
 * Checks a Venue or Provider Foxer's TIN against its tax country's formats
 * (utils/tax-id-formats) and rewrites it compact (separators removed) for
 * storage. Returns the message to show, or null. An application without
 * `tinCountry` — the mobile app, older web builds — is checked as Philippine.
 */
export function checkTin(data: Record<string, unknown>): string | null {
  if (data.tinCountry === "" || data.tinCountry === null) {
    delete data.tinCountry;
  }
  if (data.tinCountry !== undefined) {
    if (
      typeof data.tinCountry !== "string" ||
      !/^[A-Za-z]{2}$/.test(data.tinCountry)
    ) {
      return "Tax country must be a 2-letter country code";
    }
    data.tinCountry = data.tinCountry.toUpperCase();
  }
  const tin = data.tinNumber;
  if (tin === undefined || tin === null || tin === "") return null;
  if (typeof tin !== "string") return "TIN Number must be text";

  const country =
    (data.tinCountry as string | undefined) ?? DEFAULT_TIN_COUNTRY;
  const error = validateTin(country, tin);
  if (error) return error;
  data.tinNumber = compactTin(country, tin);
  data.tinCountry = country;
  return null;
}

const TRAVEL_RANGES = new Set(["city", "province", "anywhere"]);
export const MAX_SPECIALTY_PHOTOS = 6;
const MAX_SPECIALTY_DESCRIPTION = 500;

/**
 * The Provider wizard's extra answers (mobile#487, api#440): where they are
 * based, how far they travel, their main specialty, and per specialty a line
 * and photos of their work. Every one is optional, so older clients still
 * apply. Runs after the specialties are checked, so `data.specializations` is
 * the clean list. Rewrites `data` in place for storage; returns the message to
 * show, or null. Photo ownership and type are checked in the service.
 */
export function checkProviderDetails(
  data: Record<string, unknown>,
): string | null {
  const picked = (data.specializations as string[] | undefined) ?? [];

  if (
    data.basedIn === undefined ||
    data.basedIn === null ||
    data.basedIn === ""
  ) {
    delete data.basedIn;
  } else if (
    typeof data.basedIn !== "string" ||
    data.basedIn.trim().length > 120
  ) {
    return "Where you're based must be up to 120 characters";
  } else {
    data.basedIn = data.basedIn.trim();
  }

  // The device's position when "use my location" filled `basedIn`: both or
  // neither, and on the globe.
  const lat = data.basedInLat;
  const lng = data.basedInLng;
  const absent = (v: unknown) => v === undefined || v === null || v === "";
  if (absent(lat) && absent(lng)) {
    delete data.basedInLat;
    delete data.basedInLng;
  } else if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return "Your location must be a latitude and longitude";
  }

  if (
    data.travelRange === undefined ||
    data.travelRange === null ||
    data.travelRange === ""
  ) {
    delete data.travelRange;
  } else if (!TRAVEL_RANGES.has(String(data.travelRange))) {
    return "Travel range must be city, province or anywhere";
  }

  if (
    data.mainSpecialty === undefined ||
    data.mainSpecialty === null ||
    data.mainSpecialty === ""
  ) {
    if (picked.length > 0) data.mainSpecialty = picked[0];
    else delete data.mainSpecialty;
  } else if (!picked.includes(String(data.mainSpecialty))) {
    return "Your main specialty must be one of the specialties you picked";
  }

  if (data.specialtyDetails === undefined || data.specialtyDetails === null) {
    delete data.specialtyDetails;
    return null;
  }
  if (!Array.isArray(data.specialtyDetails)) {
    return "Specialty details must be a list";
  }
  const seen = new Set<string>();
  const details: {
    slug: string;
    description: string;
    photoFileIds: string[];
  }[] = [];
  for (const raw of data.specialtyDetails) {
    if (typeof raw !== "object" || raw === null) {
      return "Each specialty detail must be an object";
    }
    const entry = raw as Record<string, unknown>;
    const slug = String(entry.slug ?? "");
    if (!picked.includes(slug)) {
      return `Details were given for a specialty you did not pick: ${slug}`;
    }
    if (seen.has(slug)) return `Details for ${slug} were given twice`;
    seen.add(slug);

    const description =
      typeof entry.description === "string" ? entry.description.trim() : "";
    if (description.length === 0) {
      return "Add a line about each specialty";
    }
    if (description.length > MAX_SPECIALTY_DESCRIPTION) {
      return `Each specialty line must be up to ${MAX_SPECIALTY_DESCRIPTION} characters`;
    }

    const photos = entry.photoFileIds ?? [];
    if (
      !Array.isArray(photos) ||
      photos.some((p) => typeof p !== "string" || p === "")
    ) {
      return "Photos must be a list of uploaded files";
    }
    const photoFileIds = [...new Set(photos as string[])];
    if (photoFileIds.length > MAX_SPECIALTY_PHOTOS) {
      return `Up to ${MAX_SPECIALTY_PHOTOS} photos per specialty`;
    }
    details.push({ slug, description, photoFileIds });
  }
  data.specialtyDetails = details;
  return null;
}

/**
 * Checks a Venue Foxer's contact number with the same rule as the profile
 * phone (utils/phone) and rewrites it as E.164 for storage. A number without
 * its `+code` is read as Philippine — what the mobile app sends. Returns the
 * message to show, or null.
 */
export function checkContactNumber(
  data: Record<string, unknown>,
): string | null {
  const raw = data.contactNumber;
  if (typeof raw !== "string" || raw.trim() === "") {
    return "Contact number is required";
  }
  const e164 = normalizePhone(raw.trim());
  if (!e164) {
    return "Enter a valid contact number with its country code, like +63 917 123 4567.";
  }
  data.contactNumber = e164;
  return null;
}

export default class RoleRequestController {
  /**
   * Submit an application for a role
   * Accepts multipart/form-data with file uploads + JSON data
   */
  static async apply(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const { roleType } = req.body;

      // `data` is sent as a JSON string in multipart form-data
      const data = parseApplicationData(req.body.data);
      if (!data) {
        return res.status(400).json({
          success: false,
          message: "The application details could not be read.",
        });
      }
      // Set only from a checked claim over 30 years, never by the client.
      delete data.claimedExperience;

      // A retired role gets a pointer to Provider, not "Invalid role type".
      // Checked before any document is stored.
      const retired = retiredRoleError(roleType);
      if (retired) {
        return res.status(400).json({ success: false, message: retired });
      }
      if (!roleType || !Object.values(RoleType).includes(roleType)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid role type" });
      }

      // Before any document is stored, like the checks below.
      const missing = checkRequiredFields(roleType, data);
      if (missing) {
        return sendValidationError(res, missing, { success: true });
      }

      // A Provider names at least one catalog specialty and has no maximum.
      // Checked before any document is stored, so a refused application leaves
      // no private upload behind.
      if (roleType === RoleType.providerFoxer) {
        const specialties = await ProviderSpecialtySvc.check(
          data.specializations,
        );
        if (!specialties.ok) {
          return res
            .status(400)
            .json({ success: false, message: specialties.message });
        }
        data.specializations = specialties.slugs;
        const detailsError = checkProviderDetails(data);
        if (detailsError) {
          return res
            .status(400)
            .json({ success: false, message: detailsError });
        }
      }

      // Also before any document is stored.
      if ([RoleType.venueFoxer, RoleType.providerFoxer].includes(roleType)) {
        const tinError = checkTin(data);
        if (tinError) {
          return res.status(400).json({ success: false, message: tinError });
        }
      }
      if (roleType === RoleType.venueFoxer) {
        const phoneError = checkContactNumber(data);
        if (phoneError) {
          return res.status(400).json({ success: false, message: phoneError });
        }
      }
      if ([RoleType.eventFoxer, RoleType.providerFoxer].includes(roleType)) {
        const links = checkPortfolioUrls(data.portfolioUrls);
        if (!links.ok) {
          return res
            .status(400)
            .json({ success: false, message: links.message });
        }
        data.portfolioUrls = links.urls;

        // Optional for both. The Event Foxer column is text, the Provider's
        // a number.
        const experience = checkYearsOfExperience(data.experience);
        if (!experience.ok) {
          return res
            .status(400)
            .json({ success: false, message: experience.message });
        }
        if (experience.years !== undefined) {
          data.experience =
            roleType === RoleType.eventFoxer
              ? String(experience.years)
              : experience.years;
        }
        const claimError = applyExperienceClaim(
          data,
          experience.years,
          !!(req.files as Record<string, unknown[]> | undefined)?.portfolioFile
            ?.length,
        );
        if (claimError) {
          return res.status(400).json({ success: false, message: claimError });
        }
      }

      // Store each uploaded document
      const files = req.files as
        Record<string, Express.Multer.File[]> | undefined;

      if (files) {
        for (const [fieldName, fileArray] of Object.entries(files)) {
          const file = fileArray[0];
          if (!file) continue;

          const dbColumn = FILE_FIELD_TO_DB_COLUMN[fieldName];
          if (!dbColumn) continue;

          // Identity documents go to the private bucket — no public URL. A
          // portfolio is a PDF or Word document only (app#371).
          const dbFile = await FileSvc.storePrivateDocument(
            userId,
            file,
            fieldName === "portfolioFile" ? "portfolio" : "document",
          );

          // Inject the file ID into application data
          data[dbColumn] = dbFile.id;
        }
      }

      // Venue and Event Foxers declare at most 3 specializations; a Provider has
      // no maximum (checked above).
      if (
        roleType !== RoleType.providerFoxer &&
        Array.isArray(data.specializations) &&
        data.specializations.length > 3
      ) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 specializations allowed",
        });
      }

      if (roleType === RoleType.providerFoxer) {
        if (
          typeof data.nbiClearanceIdNumber === "string" &&
          data.nbiClearanceIdNumber.length > 0 &&
          !/^\d{1,18}$/.test(data.nbiClearanceIdNumber)
        ) {
          return res.status(400).json({
            success: false,
            message: "NBI Clearance ID must be 1-18 digits",
          });
        }
      }

      if (roleType === RoleType.organizer) {
        const organizerError = validateOrganizerApplication(data);
        if (organizerError) {
          return res
            .status(400)
            .json({ success: false, message: organizerError });
        }
      }

      const application = await RoleRequestService.submitApplication(
        userId,
        roleType,
        data,
      );

      return res.status(201).json({
        success: true,
        message: `Application for ${roleType} submitted successfully`,
        data: application,
      });
    } catch (e: unknown) {
      // Prisma's text quotes the query and its columns (api#366): a recognised
      // error gets a fixed message, anything else is logged and answered 500.
      if (isPrismaError(e)) {
        return sendServerError(res, e, { success: true });
      }
      // The service throws plain Errors meant for the applicant ("An
      // application for the venueFoxer role is already pending").
      console.error("Application error:", e);
      return sendFailure(res, e, 400, { success: true });
    }
  }

  static async listMine(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const requests = await RoleRequestService.getMyRequests(userId);
      return res.status(200).json({ success: true, data: requests });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin: List all applications
   */
  static async list(req: Request, res: Response) {
    try {
      const { status } = req.query;
      // Admin-only route, so the documents get their short-lived links here.
      const requests = await signPrivateFiles(
        await RoleRequestService.getRequests(status as RequestStatus),
      );

      return res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin: Review an application
   */
  static async review(req: Request, res: Response) {
    try {
      const adminId = req.user?.userId;
      if (!adminId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const { id } = req.params;
      const {
        status,
        rejectionReason,
        flaggedDocuments,
        revisionNote,
        experienceDecision,
      } = req.body;

      if (!id)
        return res
          .status(400)
          .json({ success: false, message: "Request ID required" });
      if (
        ![
          RequestStatus.approved,
          RequestStatus.rejected,
          RequestStatus.revision_requested,
        ].includes(status)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status" });
      }
      if (
        status === RequestStatus.revision_requested &&
        (!Array.isArray(flaggedDocuments) || flaggedDocuments.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Flag at least one document to request revision",
        });
      }
      if (
        experienceDecision !== undefined &&
        experienceDecision !== "base" &&
        experienceDecision !== "claimed"
      ) {
        return res.status(400).json({
          success: false,
          message: 'experienceDecision must be "base" or "claimed"',
        });
      }

      const updatedRequest = await RoleRequestService.reviewApplication(
        id,
        adminId,
        status,
        rejectionReason,
        flaggedDocuments,
        revisionNote,
        experienceDecision,
      );

      announceAdminQueueChanged();
      announceToUser(updatedRequest.userId, "roles");
      return res.status(200).json({
        success: true,
        message: `Application ${status} successfully`,
        data: updatedRequest,
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Review error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Applicant: withdraw their own application while no admin has decided it
   * (api#367). 404 for a missing request or someone else's, 400 for one
   * already decided.
   */
  static async withdraw(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const { id } = req.params;
      if (!id)
        return res
          .status(400)
          .json({ success: false, message: "Request ID required" });

      const withdrawn = await RoleRequestService.withdrawApplication(
        id,
        userId,
      );
      // The admin Role Applications list drops it from the review queue.
      announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: "Application withdrawn",
        data: withdrawn,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  /**
   * Applicant: resubmit just the documents flagged on their own
   * revision_requested application. Files are already-uploaded fileIds
   * (same direct-to-S3 flow the initial apply form uses), keyed by the same
   * field names admins flag (validId1, nbiFile, tinIdFile, birPermitFile,
   * selfieFile, portfolioFile).
   */
  static async resubmitDocuments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const { id } = req.params;
      const { documents } = req.body;

      if (!id)
        return res
          .status(400)
          .json({ success: false, message: "Request ID required" });
      if (!documents || typeof documents !== "object") {
        return res
          .status(400)
          .json({ success: false, message: "Documents are required" });
      }

      const { updated, reopened } = await RoleRequestService.resubmitDocuments(
        id,
        userId,
        documents,
      );

      if (reopened) announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: reopened
          ? "Documents resubmitted — your application is back in the review queue"
          : "Documents resubmitted",
        data: updated,
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Resubmit error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

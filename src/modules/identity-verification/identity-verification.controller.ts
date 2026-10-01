import { Request, Response } from "express";
import { RequestStatus } from "@prisma/client";
import { sendServerError } from "../../utils/errors";
import FileSvc from "../file/file.service";
import { signPrivateFiles } from "../../utils/private-files";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";
import IdentityVerificationSvc, {
  isIdType,
} from "./identity-verification.service";

// An ID is a photo or a scan — no video, unlike S3Svc's general allowance.
const isDocument = (file: Express.Multer.File) =>
  file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";

// IDs and selfies go to the private bucket — never a public URL.
const store = (userId: string, file: Express.Multer.File) =>
  FileSvc.storePrivateDocument(userId, file);

export default class IdentityVerificationCtrl {
  // GET /identity-verification/me
  static async getMine(req: Request, res: Response) {
    try {
      const data = await IdentityVerificationSvc.getMine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return sendServerError(res, e, { success: true });
    }
  }

  // POST /identity-verification — multipart: idType, idFile, selfieFile?
  static async submit(req: Request, res: Response) {
    const userId = req.user!.userId;
    const files = req.files as
      Record<string, Express.Multer.File[]> | undefined;
    const idFile = files?.idFile?.[0];
    const selfieFile = files?.selfieFile?.[0];
    const { idType } = req.body;

    if (!isIdType(idType)) {
      return res.status(400).json({
        success: false,
        message: "Choose the kind of ID you're sending",
      });
    }
    if (!idFile) {
      return res.status(400).json({
        success: false,
        message: "A photo or scan of your ID is required",
      });
    }
    if (!isDocument(idFile) || (selfieFile && !isDocument(selfieFile))) {
      return res
        .status(400)
        .json({ success: false, message: "Upload images or PDFs only" });
    }

    try {
      await IdentityVerificationSvc.assertCanSubmit(userId);
      const storedId = await store(userId, idFile);
      const storedSelfie = selfieFile
        ? await store(userId, selfieFile)
        : undefined;
      const data = await IdentityVerificationSvc.submit(
        userId,
        idType,
        storedId.id,
        storedSelfie?.id,
      );
      announceToAdmins("identity");
      announceToUser(userId, "identity");
      return res.status(201).json({ success: true, data });
    } catch (e) {
      // The upload rejects bad types/sizes with a plain Error meant for the user.
      if (!(e instanceof Error) || e.constructor !== Error) {
        return sendServerError(res, e, { success: true });
      }
      return res.status(400).json({ success: false, message: e.message });
    }
  }

  // GET /identity-verification?status=pending — admin queue.
  static async list(req: Request, res: Response) {
    const status = req.query.status;
    if (
      status !== undefined &&
      !Object.values(RequestStatus).includes(status as RequestStatus)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }
    try {
      // Admin-only route: the ID files get their short-lived links here.
      const data = await signPrivateFiles(
        await IdentityVerificationSvc.list(status as RequestStatus | undefined),
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return sendServerError(res, e, { success: true });
    }
  }

  // PATCH /identity-verification/:id/review — { decision, reason? }
  static async review(req: Request, res: Response) {
    const { decision, reason } = req.body ?? {};
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({
        success: false,
        message: "decision must be approved or rejected",
      });
    }
    try {
      const { userId } = await IdentityVerificationSvc.review(
        String(req.params.id),
        req.user!.userId,
        decision,
        typeof reason === "string" ? reason : undefined,
      );
      announceToAdmins("identity");
      // `identity` refreshes their /kyc page and the profile key behind the
      // badge.
      announceToUser(userId, "identity");
      return res.status(200).json({ success: true });
    } catch (e) {
      return sendServerError(res, e, { success: true });
    }
  }
}

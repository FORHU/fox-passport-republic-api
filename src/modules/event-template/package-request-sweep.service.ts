import { MatchRequestStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { eventTemplateCache } from "../../utils/cache-namespaces";
import NotificationService from "../notifications/user-notification.service";
import EventTemplateSvc from "./event-template.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A request has this long to be answered (api#462). */
export const REQUEST_TTL_MS = 3 * DAY_MS;

/** The Supplier is reminded this long after being asked. */
export const REMIND_AFTER_MS = 2 * DAY_MS;

type Kind = "asset" | "service" | "venue";

interface WaitingLine {
  kind: Kind;
  id: string;
  templateId: string;
  supplierId: string | null;
  listingName: string;
  packageName: string;
}

/** Waiting lines asked before `before`, optionally only the unreminded. */
async function waitingLines(before: Date, unremindedOnly: boolean) {
  const where = {
    matched: true,
    matchRequestStatus: MatchRequestStatus.pending,
    requestedAt: { lt: before },
    ...(unremindedOnly && { remindedAt: null }),
  };
  const template = { select: { name: true } };
  const [assets, services, venues] = await Promise.all([
    prisma.eventTemplateAsset.findMany({
      where,
      select: {
        id: true,
        templateId: true,
        template,
        asset: { select: { name: true, ownerId: true } },
      },
    }),
    prisma.eventTemplateService.findMany({
      where,
      select: {
        id: true,
        templateId: true,
        template,
        service: { select: { name: true, ownerId: true } },
      },
    }),
    prisma.eventTemplateVenue.findMany({
      where,
      select: {
        id: true,
        templateId: true,
        template,
        venue: { select: { name: true, mayorId: true } },
      },
    }),
  ]);
  const lines: WaitingLine[] = [
    ...assets.map((l) => ({
      kind: "asset" as const,
      id: l.id,
      templateId: l.templateId,
      supplierId: l.asset?.ownerId ?? null,
      listingName: l.asset?.name ?? "",
      packageName: l.template.name,
    })),
    ...services.map((l) => ({
      kind: "service" as const,
      id: l.id,
      templateId: l.templateId,
      supplierId: l.service?.ownerId ?? null,
      listingName: l.service?.name ?? "",
      packageName: l.template.name,
    })),
    ...venues.map((l) => ({
      kind: "venue" as const,
      id: l.id,
      templateId: l.templateId,
      supplierId: l.venue?.mayorId ?? null,
      listingName: l.venue?.name ?? "",
      packageName: l.template.name,
    })),
  ];
  return lines;
}

/** Updates one line, only while it is still waiting. */
async function updateWaiting(
  line: WaitingLine,
  data: { matchRequestStatus?: MatchRequestStatus; remindedAt?: Date },
) {
  const where = { id: line.id, matchRequestStatus: MatchRequestStatus.pending };
  const { count } =
    line.kind === "asset"
      ? await prisma.eventTemplateAsset.updateMany({ where, data })
      : line.kind === "service"
        ? await prisma.eventTemplateService.updateMany({ where, data })
        : await prisma.eventTemplateVenue.updateMany({ where, data });
  return count > 0;
}

/**
 * Package requests (api#462): a request not answered in 3 days expires, and
 * a reminder goes out after 2. Expiring frees the spot. Run often; each step
 * only touches lines still waiting, so a rerun does nothing twice.
 */
export default class PackageRequestSweepSvc {
  static async run(now = new Date()) {
    let expired = 0;
    let reminded = 0;

    for (const line of await waitingLines(
      new Date(now.getTime() - REQUEST_TTL_MS),
      false,
    )) {
      if (
        !(await updateWaiting(line, {
          matchRequestStatus: MatchRequestStatus.expired,
        }))
      ) {
        continue;
      }
      expired += 1;
      if (line.supplierId) {
        await NotificationService.create({
          userId: line.supplierId,
          type: "PACKAGE_INVITE_EXPIRED",
          title: "Package request expired",
          message: `The request to add ${line.listingName} to ${line.packageName} expired.`,
          metadata: { templateId: line.templateId },
        }).catch((e) => console.error("Failed to notify an expiry", e));
      }
      await EventTemplateSvc.tellEventFoxer(line.templateId, {
        title: "A request expired",
        message: `${line.listingName} didn't answer in 3 days. Swap or remove it in`,
      });
    }

    for (const line of await waitingLines(
      new Date(now.getTime() - REMIND_AFTER_MS),
      true,
    )) {
      if (!(await updateWaiting(line, { remindedAt: now }))) continue;
      reminded += 1;
      if (line.supplierId) {
        await NotificationService.create({
          userId: line.supplierId,
          type: "PACKAGE_INVITE_REMINDER",
          title: "1 day left to answer",
          message: `You're asked to add ${line.listingName} to ${line.packageName}. The request expires tomorrow.`,
          metadata: { templateId: line.templateId },
        }).catch((e) => console.error("Failed to send a reminder", e));
      }
    }

    if (expired > 0 || reminded > 0) await eventTemplateCache.invalidateAll();
    return { expired, reminded };
  }
}

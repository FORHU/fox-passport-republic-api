import { prisma } from "../../utils/prisma";
import { sendApprovedEmail } from "../../utils/emails/approved";
import { sendRejectedEmail } from "../../utils/emails/rejected";

/**
 * Sends the approval / rejection email from the `/admin/*` routes.
 *
 * The templates and the wording already existed — they were only ever wired to
 * the resource-level routes (`PATCH /venues/:id/approve`), which nothing in the
 * app calls. Deciding through the admin console therefore sent the owner no
 * email at all. This reuses the same two templates rather than writing new ones,
 * so both paths say the same thing.
 *
 * Fire-and-forget by design: the decision is already committed, and a mail
 * provider being slow or down must not fail the admin's request or roll anything
 * back. Failures are logged, matching how the resource-level routes handle it.
 */

export type DecisionEntity =
  "venue" | "asset" | "service" | "eventTemplate" | "event";

/** How each entity is named to the person receiving the email. */
const ENTITY_LABEL: Record<DecisionEntity, string> = {
  venue: "Venue",
  asset: "Item",
  service: "Service",
  eventTemplate: "Event template",
  event: "Event",
};

interface Recipient {
  email: string;
  entityName: string;
}

/**
 * Each model keeps its owner under a different relation — `mayor`, `owner`,
 * `client` — which is exactly the kind of difference a single generic lookup
 * would get wrong silently, so each is spelled out.
 */
async function findRecipient(
  entity: DecisionEntity,
  id: string,
): Promise<Recipient | null> {
  const shape = { name: true } as const;

  switch (entity) {
    case "venue": {
      const row = await prisma.venue.findUnique({
        where: { id },
        select: { ...shape, mayor: { select: { email: true } } },
      });
      return row?.mayor?.email
        ? { email: row.mayor.email, entityName: row.name }
        : null;
    }
    case "asset": {
      const row = await prisma.asset.findUnique({
        where: { id },
        select: { ...shape, owner: { select: { email: true } } },
      });
      return row?.owner?.email
        ? { email: row.owner.email, entityName: row.name }
        : null;
    }
    case "service": {
      const row = await prisma.service.findUnique({
        where: { id },
        select: { ...shape, owner: { select: { email: true } } },
      });
      return row?.owner?.email
        ? { email: row.owner.email, entityName: row.name }
        : null;
    }
    case "eventTemplate": {
      const row = await prisma.eventTemplate.findUnique({
        where: { id },
        select: { ...shape, owner: { select: { email: true } } },
      });
      return row?.owner?.email
        ? { email: row.owner.email, entityName: row.name }
        : null;
    }
    case "event": {
      const row = await prisma.event.findUnique({
        where: { id },
        select: { ...shape, client: { select: { email: true } } },
      });
      return row?.client?.email
        ? { email: row.client.email, entityName: row.name }
        : null;
    }
  }
}

export function sendDecisionEmail(input: {
  entity: DecisionEntity;
  id: string;
  approved: boolean;
  /** Only used on a rejection; the admin's own words where they gave any. */
  reason?: unknown;
}): void {
  const { entity, id, approved } = input;

  void (async () => {
    try {
      const recipient = await findRecipient(entity, id);
      if (!recipient) return;

      const entityType = ENTITY_LABEL[entity];

      if (approved) {
        await sendApprovedEmail({
          to: recipient.email,
          entityName: recipient.entityName,
          entityType,
        });
        return;
      }

      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason.trim()
          : "No reason given.";

      await sendRejectedEmail({
        to: recipient.email,
        entityName: recipient.entityName,
        entityType,
        reason,
      });
    } catch (e) {
      console.error(`Failed to send ${entity} decision email:`, e);
    }
  })();
}

import { AppError } from "../../utils/errors";

export type AvailabilityItemKind = "asset" | "service" | "venue";

export interface AvailabilityCheckItem {
  kind: AvailabilityItemKind;
  itemId: string; // assetId or serviceId
  dateRange: { start: Date; end: Date };
  quantity?: number; // assets only; defaults to 1
  /** Services only — where the new booking happens, for the provider's
   * travel buffer (see ProviderSchedule). An Event's city is looked up from
   * `eventId`; a direct booking passes its free-text `location`. Neither
   * known means "somewhere else", the conservative reading. */
  eventId?: string | null;
  location?: string | null;
}

// Statuses that count as consuming inventory/calendar space on
// EventAssetTransaction / EventServiceTransaction. Anything not in this list
// (rejected, cancelled) has already released its slot.
export const RESERVING_TRANSACTION_STATUSES = [
  "pending_provider_confirmation",
  "pending",
  "approved",
] as const;

export class AvailabilityConflictError extends AppError {
  constructor(
    message: string,
    public readonly kind: AvailabilityItemKind,
    public readonly itemId: string,
  ) {
    super(message, 409, "AVAILABILITY_CONFLICT");
  }
}

export type AvailabilityItemKind = "asset" | "service";

export interface AvailabilityCheckItem {
  kind: AvailabilityItemKind;
  itemId: string; // assetId or serviceId
  dateRange: { start: Date; end: Date };
  quantity?: number; // assets only; defaults to 1
}

// Statuses that count as consuming inventory/calendar space on
// EventAssetTransaction / EventServiceTransaction. Anything not in this list
// (rejected, cancelled) has already released its slot.
export const RESERVING_TRANSACTION_STATUSES = [
  "pending_provider_confirmation",
  "pending",
  "approved",
] as const;

export class AvailabilityConflictError extends Error {
  constructor(
    message: string,
    public readonly kind: AvailabilityItemKind,
    public readonly itemId: string,
  ) {
    super(message);
    this.name = "AvailabilityConflictError";
  }
}

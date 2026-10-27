import cron from "node-cron";
import EventRequestSvc from "../modules/event-request/event-request.service";

/**
 * Daily at 01:00: flag Events that ended with bookings and nobody checked in,
 * for a person to settle. Flagging only - no status change. See
 * EventRequestSvc.flagUnattendedPast.
 */
export function scheduleUnattendedEventsSweep() {
  cron.schedule("0 1 * * *", () => {
    EventRequestSvc.flagUnattendedPast().catch((e) =>
      console.error("Unattended events sweep failed", e),
    );
  });
}

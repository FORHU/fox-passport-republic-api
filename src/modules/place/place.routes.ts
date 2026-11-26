import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import PlaceCtrl from "./place.controller";

/**
 * Places (epic #517). Every route needs a signed-in account; what each one
 * returns is decided per viewer in the service and `place-view.ts`.
 */
const router = Router();

router.post("/", authenticate, PlaceCtrl.create);
router.get("/mine", authenticate, PlaceCtrl.listMine);
// The Place an event is held at, as the viewer may see it (api#520).
router.get("/event/:eventId", authenticate, PlaceCtrl.getForEvent);
// Recorded location changes once booked (api#521).
router.post(
  "/event/:eventId/location",
  authenticate,
  PlaceCtrl.changeEventPlace,
);
router.get(
  "/event/:eventId/location-changes",
  authenticate,
  PlaceCtrl.listEventChanges,
);
router.post(
  "/location-changes/:id/acknowledge",
  authenticate,
  PlaceCtrl.acknowledgeChange,
);
router.get("/:id", authenticate, PlaceCtrl.get);
router.patch("/:id", authenticate, PlaceCtrl.update);
// Archives: a Place is never deleted, so events that used it keep it.
router.delete("/:id", authenticate, PlaceCtrl.archive);

export default router;

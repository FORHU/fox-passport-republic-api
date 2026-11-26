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
router.get("/:id", authenticate, PlaceCtrl.get);
router.patch("/:id", authenticate, PlaceCtrl.update);
// Archives: a Place is never deleted, so events that used it keep it.
router.delete("/:id", authenticate, PlaceCtrl.archive);

export default router;

import { Router } from "express";
import FacebookController from "./facebook.controller";
import { authenticate } from "../../middleware/auth.middleware";

// Sharing posts to a Facebook Page. Every authenticated route acts only on the
// caller's own connection, and sharing checks post ownership in the service,
// so none needs a capability permission (see tools/validate-rbac-guards.mjs).
const router = Router();

// Meta's redirect after the permission dialog: no session, the OAuth state
// identifies the Foxer.
router.get("/callback", FacebookController.callback);

router.get("/", authenticate, FacebookController.getConnection);
router.delete("/", authenticate, FacebookController.disconnect);
router.get("/connect-url", authenticate, FacebookController.getConnectUrl);
router.get("/pages", authenticate, FacebookController.listPages);
router.put("/page", authenticate, FacebookController.selectPage);
router.post("/shares", authenticate, FacebookController.share);
router.get("/shares/:postId", authenticate, FacebookController.getShare);

export default router;

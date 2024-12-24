import express from "express";
import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import DeactivationRequestCtrl from "../controllers/requests.controller";
import RequestCtrl from "../controllers/requests.controller";

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken], DeactivationRequestCtrl.getRequests);
router.post("/", [sessionMiddleware, authenticateToken], DeactivationRequestCtrl.createRequest);
router.delete("/:id", [sessionMiddleware, authenticateToken], DeactivationRequestCtrl.deleteRequest);
router.patch("/update-request/:id", [sessionMiddleware, authenticateToken], RequestCtrl.updateRequestToBook);

//user routes
router.patch("/:id", [sessionMiddleware, authenticateToken], RequestCtrl.approveDeletion);

//space routes
router.patch("/update/:id", [sessionMiddleware, authenticateToken], RequestCtrl.approveUpdate);
export default router;

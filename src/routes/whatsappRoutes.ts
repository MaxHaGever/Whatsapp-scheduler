import { Router } from "express";
import { verifyWebhook, handleWebhook } from "../controller/whatsappController";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", handleWebhook);

export default router;

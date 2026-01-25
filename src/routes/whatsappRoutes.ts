import { Router } from "express";
import { handleWebhookPost } from "../controller/whatsappController";

const router = Router();

/**
 * GET /webhook/whatsapp
 * Meta webhook verification.
 */
router.get("/", (req, res) => {
  const modeRaw = req.query["hub.mode"];
  const tokenRaw = req.query["hub.verify_token"];
  const challengeRaw = req.query["hub.challenge"];

  const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const challenge = Array.isArray(challengeRaw) ? challengeRaw[0] : challengeRaw;

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", handleWebhookPost);

export default router;

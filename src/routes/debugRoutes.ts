import { Router } from "express";
import { getMessagesByWaId } from "../controller/debugController";

const router = Router();

router.get("/messages/:waId", getMessagesByWaId);

export default router;

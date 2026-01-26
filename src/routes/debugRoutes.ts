import { Router } from "express";
import { getMessagesByWaId } from "../controller/debugController";
import { getCalendarConnection } from "../controller/calendarDebugController";


const router = Router();

router.get("/messages/:waId", getMessagesByWaId);
router.get("/calendar/:businessId", getCalendarConnection);

export default router;

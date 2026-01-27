import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getBusiness, updateBusiness } from "../controller/businessController";

const router = express.Router();

router.get("/", protect, getBusiness);
router.put("/", protect, updateBusiness);

export default router;

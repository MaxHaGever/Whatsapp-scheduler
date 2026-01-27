import { Response, NextFunction } from "express";
import { AuthenticateRequest } from "../middleware/authMiddleware";
import { BusinessModel } from "../models/Business";

export const getWhatsAppStatus = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.businessId) {
      return res.status(401).json({ message: "Missing businessId in token" });
    }

    const business = await BusinessModel.findById(req.businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    const connected = !!(business.wabaId && business.phoneNumberId);

    return res.json({
      connected,
      wabaId: business.wabaId ?? null,
      phoneNumberId: business.phoneNumberId ?? null,
    });
  } catch (err) {
    next(err);
  }
};

export const connectWhatsApp = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.businessId) {
      return res.status(401).json({ message: "Missing businessId in token" });
    }

    const { wabaId, phoneNumberId } = req.body;

    if (!wabaId || !phoneNumberId) {
      return res.status(400).json({ message: "wabaId and phoneNumberId are required" });
    }

    const business = await BusinessModel.findByIdAndUpdate(
      req.businessId,
      { wabaId, phoneNumberId },
      { new: true }
    );

    if (!business) return res.status(404).json({ message: "Business not found" });

    return res.json({
      connected: true,
      wabaId: business.wabaId ?? null,
      phoneNumberId: business.phoneNumberId ?? null,
    });
  } catch (err) {
    next(err);
  }
};

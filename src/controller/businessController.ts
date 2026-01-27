import { Response, NextFunction } from "express";
import { AuthenticateRequest } from "../middleware/authMiddleware";
import { BusinessModel } from "../models/Business";

export const getBusiness = async (req: AuthenticateRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.businessId) {
      return res.status(401).json({ message: "Missing businessId in token" });
    }

    const business = await BusinessModel.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({
      id: business._id,
      name: business.name,
      timezone: business.timezone,
      wabaId: business.wabaId ?? null,
      phoneNumberId: business.phoneNumberId ?? null,
    });
  } catch (err) {
    next(err);
  }
};

export const updateBusiness = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.businessId) {
      return res.status(401).json({ message: "Missing businessId in token" });
    }

    const { name, timezone, wabaId, phoneNumberId } = req.body;

    const business = await BusinessModel.findByIdAndUpdate(
      req.businessId,
      {
        ...(name !== undefined ? { name } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(wabaId !== undefined ? { wabaId } : {}),
        ...(phoneNumberId !== undefined ? { phoneNumberId } : {}),
      },
      { new: true }
    );

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({
      id: business._id,
      name: business.name,
      timezone: business.timezone,
      wabaId: business.wabaId ?? null,
      phoneNumberId: business.phoneNumberId ?? null,
    });
  } catch (err) {
    next(err);
  }
};

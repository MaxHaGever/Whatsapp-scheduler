import type { Request, Response } from "express";
import Business from "../models/Business";
import { sendTextMessage } from "../services/whatsappGraph";

// If you already extend Request with user somewhere, use that type.
// Otherwise keep this small helper:
type AuthedRequest = Request & { user?: { userId: string; businessId: string } };

function requireBusinessId(req: AuthedRequest): string {
  const bid = req.user?.businessId;
  if (!bid) throw new Error("Missing businessId in auth context");
  return bid;
}

export async function getWhatsAppStatus(req: AuthedRequest, res: Response) {
  const businessId = requireBusinessId(req);

  const business = await Business.findById(businessId).select(
    "whatsappWabaId whatsappPhoneNumberId whatsappConnected updatedAt"
  );

  if (!business) return res.status(404).json({ message: "Business not found" });

  return res.json({
    connected: Boolean(business.whatsappConnected && business.whatsappPhoneNumberId && business.whatsappWabaId),
    wabaId: business.whatsappWabaId ?? null,
    phoneNumberId: business.whatsappPhoneNumberId ?? null,
    updatedAt: business.updatedAt ?? null,
  });
}

export async function connectWhatsApp(req: AuthedRequest, res: Response) {
  const businessId = requireBusinessId(req);
  const { wabaId, phoneNumberId, accessToken } = req.body ?? {};

  if (!wabaId || !phoneNumberId || !accessToken) {
    return res.status(400).json({
      message: "Missing required fields: wabaId, phoneNumberId, accessToken",
    });
  }

  const waba = String(wabaId).trim();
  const pnid = String(phoneNumberId).trim();
  const token = String(accessToken).trim();

  try {
    // ✅ PRE-CHECK: avoid E11000 and give a friendly 409
    const existing = await Business.findOne({
      whatsappPhoneNumberId: pnid,
      _id: { $ne: businessId },
    }).select("_id");

    if (existing) {
      return res.status(409).json({
        message: "This phoneNumberId is already connected to another business in the system.",
      });
    }

    const updated = await Business.findByIdAndUpdate(
      businessId,
      {
        whatsappWabaId: waba,
        whatsappPhoneNumberId: pnid,
        whatsappAccessToken: token,
        whatsappConnected: true,
      },
      { new: true, runValidators: true }
    ).select("whatsappWabaId whatsappPhoneNumberId whatsappConnected updatedAt");

    if (!updated) return res.status(404).json({ message: "Business not found" });

    return res.json({
      connected: true,
      wabaId: updated.whatsappWabaId,
      phoneNumberId: updated.whatsappPhoneNumberId,
      updatedAt: updated.updatedAt,
    });
  } catch (err: any) {
    // ✅ Robust duplicate key handling
    if (err?.code === 11000) {
      const key = Object.keys(err?.keyPattern ?? {})[0] || Object.keys(err?.keyValue ?? {})[0];
      if (key) {
        return res.status(409).json({
          message: `Duplicate key: ${key} is already used by another business.`,
          key,
          value: err?.keyValue?.[key],
        });
      }

      return res.status(409).json({
        message: "Duplicate key error: WhatsApp identifiers already used by another business.",
      });
    }

    return res.status(500).json({
      message: "Failed to connect WhatsApp",
      error: String(err?.message ?? err),
    });
  }
}


export async function sendWhatsAppTestMessage(req: AuthedRequest, res: Response) {
  const businessId = requireBusinessId(req);
  const { to, text } = req.body ?? {};

  if (!to || !text) {
    return res.status(400).json({ message: "Missing required fields: to, text" });
  }

  const business = await Business.findById(businessId).select(
    "whatsappPhoneNumberId whatsappAccessToken whatsappConnected"
  );

  if (!business) return res.status(404).json({ message: "Business not found" });
  if (!business.whatsappConnected || !business.whatsappPhoneNumberId || !business.whatsappAccessToken) {
    return res.status(400).json({ message: "WhatsApp is not connected for this business" });
  }

  try {
    const result = await sendTextMessage({
      phoneNumberId: business.whatsappPhoneNumberId,
      accessToken: business.whatsappAccessToken,
      to: String(to).trim(),
      text: String(text),
    });

    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(400).json({
      ok: false,
      message: "Test message failed. Check access token / phoneNumberId / permissions.",
      error: String(err?.message ?? err),
    });
  }
}

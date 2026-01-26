import { Request, Response } from "express";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";

function isDebugAllowed() {
  // accept: "true", "1", "yes"
  const v = String(process.env.ALLOW_DEBUG ?? "").toLowerCase().trim();
  return v === "true" || v === "1" || v === "yes";
}

export async function getMessagesByWaId(req: Request, res: Response) {
  if (!isDebugAllowed()) {
    return res.status(403).json({ error: "Debugging not allowed" });
  }

  try {
    const waIdParam = req.params.waId;

    if (!waIdParam || typeof waIdParam !== "string") {
      return res.status(400).json({ error: "Missing waId param" });
    }

    const waId = waIdParam.trim();
    if (!waId) {
      return res.status(400).json({ error: "Empty waId param" });
    }

    const contact = await ContactModel.findOne({ waId }).lean();
    if (!contact) {
      return res.status(404).json({ error: "Contact not found", waId });
    }

    const messages = await MessageModel.find({ contactId: contact._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Reverse into chronological order
    const ordered = messages.reverse();

    return res.json({
      waId,
      contactId: String(contact._id),
      count: ordered.length,
      messages: ordered.map((m: any) => ({
        direction: m.direction,
        body: m.body,
        status: m.status,
        waMessageId: m.waMessageId ?? null,
        sentAt: m.sentAt ?? null,
        createdAt: m.createdAt ?? null,
        eventId: m.meta?.eventId ?? null, // ✅ THIS is what we care about after booking
        meta: m.meta ?? {},               // keep full meta for debugging
      })),
    });
  } catch (err) {
    console.error("[DEBUG_MESSAGES_ERROR]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

import { Request, Response } from "express";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";

/**
 * GET /debug/messages/:waId
 * Returns last 20 messages for that WhatsApp contact
 */
export async function getMessagesByWaId(req: Request, res: Response) {
  try {
    const waId = req.params.waId;
    if (!waId) return res.status(400).json({ error: "Missing waId param" });

    const contact = await ContactModel.findOne({ waId }).lean();
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    const messages = await MessageModel.find({ contactId: contact._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      waId,
      contactId: String(contact._id),
      count: messages.length,
      messages: messages
        .reverse()
        .map((m: any) => ({
          direction: m.direction,
          body: m.body,
          status: m.status,
          waMessageId: m.waMessageId ?? null,
          sentAt: m.sentAt ?? null,
          createdAt: m.createdAt ?? null,
        })),
    });
  } catch (err) {
    console.error("[DEBUG_MESSAGES_ERROR]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

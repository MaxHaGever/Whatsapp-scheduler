import { Request, Response } from "express";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";

/**
 * Debug gate
 * Enable only when ALLOW_DEBUG=true in env
 */
function isDebugEnabled(): boolean {
  return process.env.ALLOW_DEBUG === "true";
}

type DebugMessageDTO = {
  direction: string;
  body: string;
  status: string;
  waMessageId: string | null;
  sentAt: string | null;
  createdAt: string | null;
};

/**
 * GET /debug/messages/:waId
 * Returns last 20 messages for that WhatsApp contact (chronological order).
 */
export async function getMessagesByWaId(req: Request, res: Response) {
  try {
    // ✅ Protect debug endpoint
    if (!isDebugEnabled()) {
      return res.status(403).json({ error: "Debugging not allowed" });
    }

    const raw = req.params.waId;

    if (typeof raw !== "string") {
  return res.status(400).json({ error: "Invalid waId param" });
}

const waId = raw.trim();
    if (!waId) {
      return res.status(400).json({ error: "Missing waId param" });
    }

    const contact = await ContactModel.findOne({ waId }).lean();
    if (!contact) {
      return res.status(404).json({ error: "Contact not found", waId });
    }

    const messages = await MessageModel.find({ contactId: contact._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const dto: DebugMessageDTO[] = messages
      .reverse()
      .map((m: any) => ({
        direction: m.direction,
        body: m.body,
        status: m.status,
        waMessageId: m.waMessageId ?? null,
        sentAt: m.sentAt ? new Date(m.sentAt).toISOString() : null,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      }));

    return res.json({
      waId,
      contactId: String(contact._id),
      count: dto.length,
      messages: dto,
    });
  } catch (err) {
    console.error("[DEBUG_MESSAGES_ERROR]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

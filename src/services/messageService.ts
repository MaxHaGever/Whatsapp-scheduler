import { BusinessModel } from "../models/Business"; 
import { ContactModel } from "../models/Contact";
import { MessageModel, MessageDirection, MessageStatus } from "../models/Message";
import { sendTextMessage } from "./whatsapp";

type EnsureContext = {
    businessId: string;
    waId: string;
}

async function getOrCreateContact ({businessId, waId}: EnsureContext) {
    const now = new Date();

    const contact = await ContactModel.findOneAndUpdate(
        { businessId, waId },
        { lastSeen: now },
        { new: true, upsert: true }
    );

    return contact;
}

/**
 * Temporary helper for NOW (single business mode).
 * Later: you will resolve business by phone_number_id from webhook metadata.
 */
export async function getDefaultBusinessId(): Promise<string> {
  const name = process.env.DEFAULT_BUSINESS_NAME || "Default Business";
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  const existing = await BusinessModel.findOne({ name });
  if (existing) return String(existing._id);

  const created = await BusinessModel.create({
    name,
    timezone,
    whatsappBusinessId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
  });

  return String(created._id);
}

export async function saveInboundMessage(args: {
  businessId: string;
  waId: string;
  body: string;
  waMessageId?: string | null;
  meta?: any;
  sentAt?: Date;
}) {
  const contact = await getOrCreateContact({ businessId: args.businessId, waId: args.waId });

  return MessageModel.create({
    businessId: args.businessId,
    contactId: contact._id,
    direction: "in" as MessageDirection,
    body: args.body,
    waMessageId: args.waMessageId ?? null,
    status: "unknown" as MessageStatus,
    meta: args.meta ?? {},
    sentAt: args.sentAt ?? new Date(),
  });
}

export async function sendAndStoreTextMessage(args: {
  businessId: string;
  waId: string;
  body: string;
  meta?: any;
}) {
  const contact = await getOrCreateContact({ businessId: args.businessId, waId: args.waId });

  // Send to Meta
  const result = await sendTextMessage(args.waId, args.body);

  // Save to Mongo
  const doc = await MessageModel.create({
    businessId: args.businessId,
    contactId: contact._id,
    direction: "out" as MessageDirection,
    body: result.body,
    waMessageId: result.waMessageId ?? null,
    status: "sent" as MessageStatus,
    meta: args.meta ?? {},
    sentAt: new Date(result.sentAt),
  });

  return { result, doc };
}

export async function updateMessageStatusByWaMessageId(waMessageId: string, status: MessageStatus) {
  // update the latest message with that id
  await MessageModel.updateOne(
    { waMessageId },
    { $set: { status } }
  );
}
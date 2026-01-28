import { BusinessModel } from "../models/Business";
import { ContactModel } from "../models/Contact";
import { MessageModel, MessageDirection, MessageStatus } from "../models/Message";
import { sendTextMessage } from "./whatsapp";

type EnsureContext = {
  businessId: string;
  waId: string;
};

async function getOrCreateContact({ businessId, waId }: EnsureContext) {
  const now = new Date();

  const contact = await ContactModel.findOneAndUpdate(
    { businessId, waId },
    { lastSeen: now },
    { new: true, upsert: true }
  );

  return contact;
}

/**
 * Dev convenience only.
 * In production, webhook routing should always find business by whatsappPhoneNumberId.
 */
export async function getDefaultBusinessId(): Promise<string> {
  const name = process.env.DEFAULT_BUSINESS_NAME || "Default Business";
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  // For local testing you can set your Meta TEST phone_number_id here
  const testPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // If env not set, fallback by name
  if (!testPhoneNumberId) {
    const existingByName = await BusinessModel.findOne({ name });
    if (existingByName) return String(existingByName._id);

    const created = await BusinessModel.create({
      name,
      timezone,
      whatsappPhoneNumberId: null,
      whatsappWabaId: null,
      whatsappAccessToken: null,
      whatsappConnected: false,
    });
    return String(created._id);
  }

  // Prefer matching by *production* field (so webhook routing & replies match reality)
  const existingByProdField = await BusinessModel.findOne({
    whatsappPhoneNumberId: testPhoneNumberId,
  });
  if (existingByProdField) return String(existingByProdField._id);

  // Backward compat fallback if an older doc exists
  const existingByOldField = await BusinessModel.findOne({ phoneNumberId: testPhoneNumberId });
  if (existingByOldField) return String(existingByOldField._id);

  const created = await BusinessModel.create({
    name,
    timezone,

    // keep older fields empty
    phoneNumberId: null,
    wabaId: null,

    // new fields
    whatsappPhoneNumberId: testPhoneNumberId,
    whatsappWabaId: null,
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? null, // optional dev helper
    whatsappConnected: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
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

  const waMessageId = args.waMessageId ?? null;

  // DEDUPE: if Meta retries webhook, skip if already stored
  if (waMessageId) {
    const existing = await MessageModel.findOne({
      businessId: args.businessId,
      waMessageId,
    }).lean();

    if (existing) return existing;
  }

  return MessageModel.create({
    businessId: args.businessId,
    contactId: contact._id,
    direction: "in" as MessageDirection,
    body: args.body,
    waMessageId,
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

  // ✅ Multi-tenant send: uses DB credentials for this business
  const result = await sendTextMessage({
    businessId: args.businessId,
    to: args.waId,
    text: args.body,
  });

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

export async function updateMessageStatusByWaMessageId(
  businessId: string,
  waMessageId: string,
  status: MessageStatus
) {
  await MessageModel.updateOne({ waMessageId, businessId }, { $set: { status } });
}

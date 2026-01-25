import { UserStateModel, type PendingSlot, type Lang, type Stage } from "../models/UserState";

export type UserState = {
  waId: string;
  preferredLanguage: Lang;
  stage: Stage;
  lastActiveAt: Date;

  pendingSlots: PendingSlot[];
  pendingSlotsExpiresAt: Date | null;

  pendingCancelEventIds: string[];
  pendingCancelExpiresAt: Date | null;
};

const SESSION_TTL_MIN = Number(process.env.SESSION_TTL_MINUTES || 30);
const PENDING_TTL_MIN = Number(process.env.PENDING_TTL_MINUTES || 15);

function minutesAgo(d: Date) {
  return (Date.now() - d.getTime()) / 60000;
}

export async function getOrCreateUserState(waId: string): Promise<UserState> {
  let doc = await UserStateModel.findOne({ waId });

  if (!doc) {
    doc = await UserStateModel.create({ waId });
  }

  // Session reset rule: inactive > TTL minutes
  if (doc.lastActiveAt && minutesAgo(doc.lastActiveAt) > SESSION_TTL_MIN) {
    doc.stage = "awaiting_request";
    doc.pendingSlots = [];
    doc.pendingSlotsExpiresAt = null;
    doc.pendingCancelEventIds = [];
    doc.pendingCancelExpiresAt = null;
  }

  doc.lastActiveAt = new Date();
  await doc.save();

  return doc.toObject() as UserState;
}

export async function setPreferredLanguage(waId: string, lang: Lang) {
  await UserStateModel.updateOne(
    { waId },
    { $set: { preferredLanguage: lang } },
    { upsert: true }
  );
}

export async function setStage(waId: string, stage: Stage) {
  await UserStateModel.updateOne({ waId }, { $set: { stage } }, { upsert: true });
}

export async function setPendingSlots(waId: string, slots: PendingSlot[]) {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MIN * 60000);

  await UserStateModel.updateOne(
    { waId },
    {
      $set: {
        pendingSlots: slots,
        pendingSlotsExpiresAt: expiresAt,
        stage: "awaiting_slot_choice",
      },
    },
    { upsert: true }
  );
}

export async function consumePendingSlot(waId: string, choice: number): Promise<PendingSlot | null> {
  const doc = await UserStateModel.findOne({ waId });
  if (!doc) return null;

  if (doc.pendingSlotsExpiresAt && doc.pendingSlotsExpiresAt.getTime() < Date.now()) {
    doc.pendingSlots = [];
    doc.pendingSlotsExpiresAt = null;
    doc.stage = "awaiting_request";
    await doc.save();
    return null;
  }

  const idx = choice - 1;
  const slot = doc.pendingSlots?.[idx];
  if (!slot) return null;

  doc.pendingSlots = [];
  doc.pendingSlotsExpiresAt = null;
  doc.stage = "awaiting_request";
  await doc.save();

  return slot as PendingSlot;
}

export async function setPendingCancelEvents(waId: string, eventIds: string[]) {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MIN * 60000);

  await UserStateModel.updateOne(
    { waId },
    {
      $set: {
        pendingCancelEventIds: eventIds,
        pendingCancelExpiresAt: expiresAt,
        stage: "awaiting_cancel_choice",
      },
    },
    { upsert: true }
  );
}

export async function consumePendingCancelChoice(waId: string, choice: number): Promise<string | null> {
  const doc = await UserStateModel.findOne({ waId });
  if (!doc) return null;

  if (doc.pendingCancelExpiresAt && doc.pendingCancelExpiresAt.getTime() < Date.now()) {
    doc.pendingCancelEventIds = [];
    doc.pendingCancelExpiresAt = null;
    doc.stage = "awaiting_request";
    await doc.save();
    return null;
  }

  const idx = choice - 1;
  const eventId = doc.pendingCancelEventIds?.[idx];
  if (!eventId) return null;

  doc.pendingCancelEventIds = [];
  doc.pendingCancelExpiresAt = null;
  doc.stage = "awaiting_request";
  await doc.save();

  return String(eventId);
}

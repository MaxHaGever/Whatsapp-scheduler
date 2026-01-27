import { UserState, UserStateModel } from "../models/UserState.js";
export type { Lang, PendingSlot, Stage, UserState } from "../models/UserState.js";

export async function getOrCreateUserState(
  businessId: string,
  waId: string
): Promise<UserState> {
  const nowIso = new Date().toISOString();

  const doc = await UserStateModel.findOne({ businessId, waId }).lean<UserState>();
  if (doc) {
    // Update activity on every message so session TTL works reliably
    await UserStateModel.updateOne({ businessId, waId }, { $set: { lastActiveAtIso: nowIso } });
    doc.lastActiveAtIso = nowIso;
    return doc;
  }

  const created: UserState = {
    businessId,
    waId,
    preferredLanguage: "he",
    stage: "WELCOME",
    lastActiveAtIso: nowIso,
  };

  await UserStateModel.create(created);
  return created;
}

export async function saveUserState(
  businessId: string,
  waId: string,
  patch: Partial<UserState>
): Promise<void> {
  const nowIso = new Date().toISOString();

  await UserStateModel.updateOne(
    { businessId, waId },
    {
      $set: {
        ...patch,
        lastActiveAtIso: nowIso,
      },
      $setOnInsert: {
        businessId,
        waId,
      },
    },
    { upsert: true }
  );
}

export async function resetConversationState(businessId: string, waId: string): Promise<void> {
  await saveUserState(businessId, waId, {
    stage: "WELCOME",
    pendingDayIso: undefined,
    pendingSlots: undefined,
  });
}

export function isExpired(state: UserState): boolean {
  const ttlMinutes = Number(process.env.SESSION_TTL_MIN || 15);
  const last = Date.parse(state.lastActiveAtIso);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > ttlMinutes * 60_000;
}

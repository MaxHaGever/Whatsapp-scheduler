import mongoose from "mongoose";

export type Lang = "he" | "ru" | "en";

export type Stage =
  | "WELCOME"
  | "AWAIT_DATE"
  | "AWAIT_SLOT_CHOICE"
  | "CANCEL_PICK"
  | "IDLE";

export type UserState = {
  waId: string;
  preferredLanguage: Lang;
  stage: Stage;
  lastActiveAtIso: string;     // MUST be string (no null)
  pendingDayIso?: string;      // YYYY-MM-DD
  pendingSlots?: { startIso: string; endIso: string; label: string }[];
  lastBotMessageIso?: string;
};

const UserStateSchema = new mongoose.Schema<UserState>(
  {
    waId: { type: String, required: true, unique: true },
    preferredLanguage: { type: String, required: true, default: "he" },
    stage: { type: String, required: true, default: "WELCOME" },
    lastActiveAtIso: { type: String, required: true },
    pendingDayIso: { type: String, required: false },
    pendingSlots: { type: Array, required: false },
    lastBotMessageIso: { type: String, required: false },
  },
  { timestamps: true }
);

const UserStateModel =
  mongoose.models.UserState || mongoose.model<UserState>("UserState", UserStateSchema);

export async function getOrCreateUserState(waId: string): Promise<UserState> {
  const nowIso = new Date().toISOString();

  let doc = await UserStateModel.findOne({ waId }).lean<UserState>();
  if (doc) {
    // ensure non-null string
    if (!doc.lastActiveAtIso) {
      await UserStateModel.updateOne({ waId }, { $set: { lastActiveAtIso: nowIso } });
      doc.lastActiveAtIso = nowIso;
    }
    return doc;
  }

  const created: UserState = {
    waId,
    preferredLanguage: "he",
    stage: "WELCOME",
    lastActiveAtIso: nowIso,
  };

  await UserStateModel.create(created);
  return created;
}

export async function saveUserState(waId: string, patch: Partial<UserState>): Promise<void> {
  const nowIso = new Date().toISOString();

  await UserStateModel.updateOne(
    { waId },
    {
      $set: {
        ...patch,
        lastActiveAtIso: nowIso, // always update activity time
      },
    },
    { upsert: true }
  );
}

export async function resetConversationState(waId: string): Promise<void> {
  await saveUserState(waId, {
    stage: "WELCOME",
    pendingDayIso: undefined,
    pendingSlots: undefined,
  });
}

export function isExpired(state: UserState): boolean {
  const ttlMinutes = Number(process.env.SESSION_TTL_MIN || 15);
  const last = Date.parse(state.lastActiveAtIso);
  if (!Number.isFinite(last)) return true;
  const diffMs = Date.now() - last;
  return diffMs > ttlMinutes * 60_000;
}

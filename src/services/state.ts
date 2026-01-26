import mongoose from "mongoose";

export type Lang = "he" | "ru" | "en";

// ✅ Minimal stages for fresh rebuild
export type Stage = "WELCOME" | "IDLE";

export type UserState = {
  waId: string;
  preferredLanguage: Lang;
  stage: Stage;
  lastActiveAt: Date;
};

const UserStateSchema = new mongoose.Schema<UserState>(
  {
    waId: { type: String, required: true, unique: true, index: true },
    preferredLanguage: { type: String, required: true, default: "he" },
    stage: { type: String, required: true, default: "WELCOME" },

    // ✅ Use Date instead of ISO strings (cleaner, faster)
    lastActiveAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true }
);

export const UserStateModel =
  mongoose.models.UserState || mongoose.model<UserState>("UserState", UserStateSchema);

export async function getOrCreateUserState(waId: string): Promise<UserState> {
  let doc = await UserStateModel.findOne({ waId }).lean<UserState>();

  if (doc) return doc;

  const created: UserState = {
    waId,
    preferredLanguage: "he",
    stage: "WELCOME",
    lastActiveAt: new Date(),
  };

  await UserStateModel.create(created);
  return created;
}

export async function saveUserState(waId: string, patch: Partial<UserState>): Promise<void> {
  await UserStateModel.updateOne(
    { waId },
    {
      $set: {
        ...patch,
        lastActiveAt: new Date(), // ✅ always refresh activity time
      },
    },
    { upsert: true }
  );
}

export async function resetConversationState(waId: string): Promise<void> {
  // ✅ reset only what exists now
  await saveUserState(waId, {
    stage: "WELCOME",
  });
}

export function isExpired(state: UserState): boolean {
  const ttlMinutes = Number(process.env.SESSION_TTL_MIN || 15);
  const last = state.lastActiveAt?.getTime?.();

  if (!last || !Number.isFinite(last)) return true;

  const diffMs = Date.now() - last;
  return diffMs > ttlMinutes * 60_000;
}

import mongoose from "mongoose";

export type Lang = "he" | "ru" | "en";

export type PendingSlot = {
  startIso: string;
  endIso: string;
  label: string;
};

export type Stage =
  | "WELCOME"
  | "AWAIT_INTENT"
  | "SCHEDULING_AWAIT_DATE"
  | "SCHEDULING_AWAIT_SLOT"
  | "SCHEDULING_ADJUST_DATE"
  | "CANCEL_AWAIT_TARGET"
  | "RESCHEDULE_AWAIT_TARGET"
  | "RESCHEDULE_AWAIT_NEW_DATE"
  | "IDLE";

export type UserState = {
  businessId: string;
  waId: string;
  preferredLanguage: Lang;
  stage: Stage;
  lastActiveAtIso: string;
  pendingDayIso?: string;
  pendingSlots?: PendingSlot[];
};

const UserStateSchema = new mongoose.Schema<UserState>(
  {
    businessId: { type: String, required: true },
    waId: { type: String, required: true },
    preferredLanguage: { type: String, required: true, default: "he" },
    stage: { type: String, required: true, default: "WELCOME" },
    lastActiveAtIso: { type: String, required: true },
    pendingDayIso: { type: String, required: false },
    pendingSlots: { type: Array, required: false },
  },
  { timestamps: true }
);

UserStateSchema.index({ businessId: 1, waId: 1 }, { unique: true });

export const UserStateModel =
  mongoose.models.UserState || mongoose.model<UserState>("UserState", UserStateSchema);

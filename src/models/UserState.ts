import mongoose, { Schema } from "mongoose";

export type Lang = "he" | "ru" | "en";
export type Stage =
  | "new"
  | "awaiting_request"
  | "awaiting_slot_choice"
  | "awaiting_cancel_choice";

export type PendingSlot = {
  startIso: string;
  endIso: string;
  label: string;
};

const PendingSlotSchema = new Schema<PendingSlot>(
  {
    startIso: { type: String, required: true },
    endIso: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false }
);

const UserStateSchema = new Schema(
  {
    waId: { type: String, required: true, unique: true, index: true },

    preferredLanguage: { type: String, enum: ["he", "ru", "en"], default: "he" },

    stage: {
      type: String,
      enum: ["new", "awaiting_request", "awaiting_slot_choice", "awaiting_cancel_choice"],
      default: "new",
    },

    lastActiveAt: { type: Date, default: () => new Date() },

    pendingSlots: { type: [PendingSlotSchema], default: [] },
    pendingSlotsExpiresAt: { type: Date, default: null },

    pendingCancelEventIds: { type: [String], default: [] },
    pendingCancelExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserStateModel =
  mongoose.models.UserState || mongoose.model("UserState", UserStateSchema);

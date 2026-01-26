import mongoose, { Schema, InferSchemaType } from "mongoose";

const CalendarConnectionSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },

    provider: { type: String, enum: ["google"], required: true }, // later add "outlook", "caldav"

    // Google OAuth storage (later)
    googleRefreshToken: { type: String, default: null },
    googleAccessToken: { type: String, default: null }, // optional cache
    googleTokenExpiry: { type: Date, default: null },   // optional cache

    calendarId: { type: String, default: "primary" },
    timezone: { type: String, default: "Asia/Jerusalem" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type CalendarConnection = InferSchemaType<typeof CalendarConnectionSchema>;

export const CalendarConnectionModel =
  mongoose.models.CalendarConnection ||
  mongoose.model("CalendarConnection", CalendarConnectionSchema);

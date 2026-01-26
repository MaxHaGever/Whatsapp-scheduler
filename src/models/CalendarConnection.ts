import mongoose, { Schema, InferSchemaType } from "mongoose";

const CalendarConnectionSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["google"], // later: add "outlook", "caldav"
      required: true,
    },

    // Google OAuth credentials (temporary env-seeded now, later from OAuth flow)
    googleRefreshToken: { type: String, default: null },

    calendarId: { type: String, default: "primary" },
    timezone: { type: String, default: "Asia/Jerusalem" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ✅ helpful indexes (recommended)
CalendarConnectionSchema.index({ businessId: 1, isActive: 1 });

export type CalendarConnection = InferSchemaType<typeof CalendarConnectionSchema>;

export const CalendarConnectionModel =
  mongoose.models.CalendarConnection ||
  mongoose.model("CalendarConnection", CalendarConnectionSchema);

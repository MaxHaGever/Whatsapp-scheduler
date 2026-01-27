import mongoose, { Schema, InferSchemaType } from "mongoose";

const AppointmentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true }, // ✅ FIX
    waId: { type: String, required: true, index: true },

    provider: { type: String, enum: ["google"], required: true, default: "google" },
    providerEventId: { type: String, required: true, index: true },

    startIso: { type: String, required: true },
    endIso: { type: String, required: true },

    summary: { type: String, default: "Appointment" },

    status: { type: String, enum: ["booked", "canceled"], default: "booked", index: true },
    canceledAtIso: { type: String, default: null },
  },
  { timestamps: true }
);

AppointmentSchema.index({ businessId: 1, waId: 1, startIso: 1 });
AppointmentSchema.index({ businessId: 1, providerEventId: 1 }, { unique: true });

export type Appointment = InferSchemaType<typeof AppointmentSchema>;

export const AppointmentModel =
  mongoose.models.Appointment || mongoose.model("Appointment", AppointmentSchema);

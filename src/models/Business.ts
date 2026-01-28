import mongoose, { Schema, InferSchemaType } from "mongoose";

const BusinessSchema = new Schema(
  {
    name: { type: String, required: true },
    timezone: { type: String, default: "Asia/Jerusalem" },

    /**
     * Backward-compat fields (older single-tenant)
     * Keep them so old data doesn't break.
     */
    phoneNumberId: { type: String, required: false, unique: true, sparse: true },
    wabaId: { type: String, default: null },

    /**
     * Production fields (multi-tenant WhatsApp)
     */
    whatsappPhoneNumberId: { type: String, required: false, unique: true, sparse: true },
    whatsappWabaId: { type: String, default: null },
    whatsappAccessToken: { type: String, default: null },
    whatsappConnected: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type Business = InferSchemaType<typeof BusinessSchema>;

// Named export that matches imports like: import { BusinessModel } from "../models/Business";
export const BusinessModel =
  mongoose.models.Business || mongoose.model("Business", BusinessSchema);

// Default export for older imports like: import BusinessModel from "../models/Business";
export default BusinessModel;

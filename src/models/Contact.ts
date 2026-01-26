import mongoose, { Schema, InferSchemaType, Types } from "mongoose";

const ContactSchema = new Schema(
    {
        businessId: { type: Types.ObjectId, ref: "Business", required: true, index: true },
        waId: { type: String, required: true, index: true },
        displayName: { type: String, default: null },
        lastSeen: { type: Date, default: null },
    },
    { timestamps: true }
);

ContactSchema.index({ businessId: 1, waId: 1 }, { unique: true });

export type Contact = InferSchemaType<typeof ContactSchema>;
export const ContactModel = mongoose.model("Contact", ContactSchema);

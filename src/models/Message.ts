import mongoose, { Schema, InferSchemaType, Types } from "mongoose";

export type MessageDirection = "in" | "out";
export type MessageStatus = "sent" | "delivered" | "read" | "failed" | "unknown";

const MessageSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },

    direction: { type: String, enum: ["in", "out"], required: true, index: true },

    body: { type: String, required: true },

    // Meta message id (returned when you send) or inbound id if available
    waMessageId: { type: String, default: null },

    status: { type: String, default: "unknown", index: true },

    // Useful metadata if you want later (stage, intent, raw webhook snippet)
    meta: { type: Schema.Types.Mixed, default: {} },

    sentAt: { type: Date, required: true, index: true },

  },
  { timestamps: true }
);
MessageSchema.index({ contactId: 1, createdAt: 1 });
MessageSchema.index({ businessId: 1, waMessageId: 1 }, { unique: true, sparse: true });
MessageSchema.index({ waMessageId: 1 }, { unique: true, sparse: true });

export type Message = InferSchemaType<typeof MessageSchema> & { _id: Types.ObjectId };
export const MessageModel = mongoose.model("Message", MessageSchema);

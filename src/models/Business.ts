import mongoose, {Schema, InferSchemaType} from "mongoose";

const BusinessSchema = new Schema(
    {
        name: { type: String, required: true },
        timezone: { type: String, default: "Asia/Jerusalem" },
        //WhatsApp Cloud API identifier
        phoneNumberId: { type: String, required: false, unique: true, sparse: true },
        wabaId: { type: String, default: null },
    },
    { timestamps: true }    
)

export type Business = InferSchemaType<typeof BusinessSchema>;
export const BusinessModel =
  mongoose.models.Business || mongoose.model("Business", BusinessSchema);

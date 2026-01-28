import axios from "axios";
import { BusinessModel } from "../models/Business";

type WhatsAppSendResponse = {
  messages?: Array<{ id: string }>;
};

export type WhatsAppSendResult = {
  waMessageId: string | null;
  to: string;
  body: string;
  sentAt: string;
};

export async function sendTextMessage(args: {
  businessId: string;
  to: string;
  text: string;
}): Promise<WhatsAppSendResult> {
  const { businessId, to, text } = args;

  const business = await BusinessModel.findById(businessId).select(
    "whatsappPhoneNumberId whatsappAccessToken whatsappConnected phoneNumberId"
  );

  if (!business) throw new Error("Business not found");

  // Prefer production fields
  let token: string | undefined = business.whatsappAccessToken ?? undefined;
  let phoneNumberId: string | undefined = business.whatsappPhoneNumberId ?? undefined;

  // Backward-compat / dev migration fallback
  if (!phoneNumberId && business.phoneNumberId) phoneNumberId = business.phoneNumberId;
  if (!token && process.env.WHATSAPP_ACCESS_TOKEN) token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId && process.env.WHATSAPP_PHONE_NUMBER_ID) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp not connected for this business (missing whatsappAccessToken / whatsappPhoneNumberId)."
    );
  }

  const build = process.env.APP_BUILD || "NO_BUILD";
  const finalBody = `[${build}] ${text}`;

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v24.0";
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  try {
    const resp = await axios.post<WhatsAppSendResponse>(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: finalBody },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      }
    );

    const id = resp.data?.messages?.[0]?.id ?? null;

    if (id) console.log(`[WA SEND] business=${businessId} phoneNumberId=${phoneNumberId} id=${id}`);
    else console.log(`[WA SEND] business=${businessId} phoneNumberId=${phoneNumberId} (no id)`);

    return {
      waMessageId: id,
      to,
      body: finalBody,
      sentAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("[WHATSAPP_SEND_ERROR]", status, JSON.stringify(data ?? {}, null, 2));
    throw new Error(
      `WhatsApp send failed (HTTP ${status ?? "?"}): ${data?.error?.message ?? err?.message ?? "unknown"}`
    );
  }
}

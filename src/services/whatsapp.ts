import axios from "axios";

type WhatsAppSendResponse = {
  messages?: Array<{ id: string }>;
};

export type WhatsAppSendResult = {
  waMessageId: string | null;
  to: string;
  body: string;
  sentAt: string;
};

export async function sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in env.");
  }

  // Build marker (so we can prove which deployment is responding)
  const build = process.env.APP_BUILD || "NO_BUILD";
  const finalBody = `[${build}] ${body}`;

  // Use latest Graph version (v24.0 is current in your logs)
  const url = `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`;

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
    if (id) {
      console.log(`[WA SEND] id=${id} to=${to}`);
    } else {
      console.log(`[WA SEND] to=${to} (no message id returned)`);
    }

    return {
      waMessageId: id,
      to,
      body: finalBody,
      sentAt: new Date().toISOString(),
    };
  } catch (err: any) {
    // Log useful error details from Meta
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("[WHATSAPP_SEND_ERROR]", status, JSON.stringify(data ?? {}, null, 2));
    throw new Error(
      `WhatsApp send failed (HTTP ${status ?? "?"}): ${
        data?.error?.message ?? err?.message ?? "unknown error"
      }`
    );
  }
}

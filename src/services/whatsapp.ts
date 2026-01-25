import axios from "axios";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v24.0";

export async function sendTextMessage(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in env.");
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  try {
    const resp = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 10_000
      }
    );

    return resp.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("[WHATSAPP_SEND_ERROR]", status, JSON.stringify(data));

    // Re-throw with a clean message
    throw new Error(
      `WhatsApp send failed${status ? ` (HTTP ${status})` : ""}: ${
        data?.error?.message || "Unknown error"
      }`
    );
  }
}

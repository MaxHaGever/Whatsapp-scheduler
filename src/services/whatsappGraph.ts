import fetch from "node-fetch";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v24.0";

export async function sendTextMessage(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}) {
  const { phoneNumberId, accessToken, to, text } = args;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      `WhatsApp send failed (${resp.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

import { sendTextMessage } from "../services/whatsapp";

export async function runIdleFlow(args: { waId: string }) {
  await sendTextMessage(
    args.waId,
    "✅ תודה! כרגע אני רק בגרסת בסיס 🙂\nבקרוב נוסיף קביעת תורים.\nאם רוצים להתחיל מחדש כתבו: reset"
  );
}

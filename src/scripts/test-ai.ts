import "dotenv/config";
import { extractDateIntent } from "../services/aiDate";

async function run() {
  const text = process.argv.slice(2).join(" ") || "יש מצב יש תורים בראשון הבא?";
  const out = await extractDateIntent(text);
  console.log(out);
}

run().catch(console.error);

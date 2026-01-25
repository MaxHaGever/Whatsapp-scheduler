import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { connectDb } from "./services/db";

async function main() {
  await connectDb();

  const app = createApp();
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error("[BOOT_ERROR]", e);
  process.exit(1);
});

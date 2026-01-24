import express from "express";
import whatsappRoutes from "./routes/whatsapp";
import googleRoutes from "./routes/google";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  // WhatsApp webhook
  app.use("/webhook/whatsapp", whatsappRoutes);

  // Google OAuth + Calendar routes
  app.use(googleRoutes); // <-- IMPORTANT (mounts /auth/google and /oauth2callback exactly)

  return app;
}

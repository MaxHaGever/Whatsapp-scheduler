import express from "express";
import whatsappRoutes from "./routes/whatsappRoutes";
import googleRoutes from "./routes/googleRoutes";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  app.use("/webhook/whatsapp", whatsappRoutes);
  app.use(googleRoutes);

  return app;
}

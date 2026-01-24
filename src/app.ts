import express from "express";
import whatsappRouter from "./routes/whatsapp";
import googleRoutes from "./routes/google";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => res.status(200).send("ok"));

  app.use("/webhook/whatsapp", whatsappRouter);
  app.use("/api/google", googleRoutes);

  return app;
}
import express from "express";
import whatsappRoutes from "./routes/whatsappRoutes";
import googleRoutes from "./routes/googleRoutes";
import debugeRoutes from "./routes/debugRoutes";
import authRoutes from "./routes/authRoutes";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  app.use("/api", authRoutes);
  app.use("/webhook/whatsapp", whatsappRoutes);
  app.use(googleRoutes);
  app.use("/debug", debugeRoutes);

  return app;
}

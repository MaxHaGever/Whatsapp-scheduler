import express from "express";
import whatsappRoutes from "./routes/whatsappRoutes";
import googleRoutes from "./routes/googleRoutes";
import debugeRoutes from "./routes/debugRoutes";
import authRoutes from "./routes/authRoutes";
import businessRoutes from "./routes/businessRoutes";
import calendarRoutes from "./routes/calendarRoutes";
import { handleGoogleOAuthCallbackMultiTenant } from "./controller/calendarController";
import whatsappSettingsRoutes from "./routes/whatsappSettingsRoutes";




export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  app.use("/api", authRoutes);
  app.use("/api/whatsapp", whatsappSettingsRoutes);
  app.use("/api/business", businessRoutes);
    
  app.use("/api/calendar", calendarRoutes);


  app.get("/oauth2callback", handleGoogleOAuthCallbackMultiTenant);

  app.use("/webhook/whatsapp", whatsappRoutes);

  app.use(googleRoutes);

  app.use("/debug", debugeRoutes);




  return app;
}

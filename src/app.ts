import express from "express";
import cors, { CorsOptionsDelegate } from "cors";

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

  // ---- CORS (Dashboard + local dev) ----
  const allowedOrigins = [
    "https://seashell-app-46fux.ondigitalocean.app",
    "http://localhost:4200",
  ];

  const corsOptionsDelegate: CorsOptionsDelegate = (req, callback) => {
    const originHeader = req.headers["origin"];
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    // Allow non-browser tools / server-to-server calls (WhatsApp webhooks, curl, Postman)
    if (!origin) {
      return callback(null, { origin: true, credentials: true });
    }

    const isAllowed = allowedOrigins.includes(origin as string);
    return callback(null, { origin: isAllowed, credentials: true });
  };

  app.use(cors(corsOptionsDelegate));
  app.options("*", cors(corsOptionsDelegate));

  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  // ---- API Routes ----
  app.use("/api", authRoutes);
  app.use("/api/whatsapp", whatsappSettingsRoutes);
  app.use("/api/business", businessRoutes);
  app.use("/api/calendar", calendarRoutes);

  // ---- Google OAuth callback (must match GOOGLE_REDIRECT_URI path) ----
  app.get("/oauth2callback", handleGoogleOAuthCallbackMultiTenant);

  // ---- Webhooks ----
  app.use("/webhook/whatsapp", whatsappRoutes);

  // Keep googleRoutes AFTER callback so it can't override /oauth2callback
  app.use(googleRoutes);

  app.use("/debug", debugeRoutes);

  return app;
}

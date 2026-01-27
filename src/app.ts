import express from "express";
import cors from "cors";

import whatsappRoutes from "./routes/whatsappRoutes";
import googleRoutes from "./routes/googleRoutes";
import debugeRoutes from "./routes/debugRoutes";
import authRoutes from "./routes/authRoutes";
import businessRoutes from "./routes/businessRoutes";
import calendarRoutes from "./routes/calendarRoutes";
import whatsappSettingsRoutes from "./routes/whatsappSettingsRoutes";

import { handleGoogleOAuthCallbackMultiTenant } from "./controller/calendarController";

export function createApp() {
  const app = express();

  // ---- CORS (allow dashboard + local dev) ----
  const allowedOrigins = [
    "https://seashell-app-46fux.ondigitalocean.app",
    "http://localhost:4200",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow server-to-server calls (webhooks, curl, postman) that have no Origin header
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) return callback(null, true);

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );

  // Helpful for preflight requests
  app.options("*", cors());

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

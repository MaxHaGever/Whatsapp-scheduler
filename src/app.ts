import express from "express";
import cors = require("cors");
import type { CorsOptionsDelegate } from "cors";

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
    const origin = req.headers?.origin as string | undefined;

    // Allow server-to-server / tools with no Origin header (webhooks, curl, Postman)
    if (!origin) return callback(null, { origin: true, credentials: true });

    const isAllowed = allowedOrigins.includes(origin);
    return callback(null, { origin: isAllowed, credentials: true });
  };

  const corsMiddleware = cors(corsOptionsDelegate);

  // Apply CORS to all requests (including OPTIONS)
  app.use(corsMiddleware);

  // IMPORTANT: Avoid app.options("*"...) / regex patterns that crash with your router/path-to-regexp.
  // Handle preflight generically, after CORS headers are set by corsMiddleware.
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  app.use(express.json());

  app.get("/health", (_req, res) => res.send("ok"));

  // ---- API Routes ----
  app.use("/api", authRoutes);
  app.use("/api/whatsapp", whatsappSettingsRoutes);
  app.use("/api/business", businessRoutes);
  app.use("/api/calendar", calendarRoutes);

  // ---- Google OAuth callback ----
  app.get("/oauth2callback", handleGoogleOAuthCallbackMultiTenant);

  // ---- Webhooks ----
  app.use("/webhook/whatsapp", whatsappRoutes);

  app.use(googleRoutes);
  app.use("/debug", debugeRoutes);

  return app;
}

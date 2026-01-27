import mongoose from "mongoose";
import { CalendarConnectionModel } from "../models/CalendarConnection";
import { createGoogleProvider } from "./providers/googleProvider";
import type { CalendarProvider } from "./providers/CalendarProvider";

export async function getCalendarProviderForBusiness(businessId: string): Promise<CalendarProvider> {
  const ors: any[] = [{ businessId }];

  // Support CalendarConnection.businessId being stored as ObjectId
  if (mongoose.Types.ObjectId.isValid(businessId)) {
    ors.push({ businessId: new mongoose.Types.ObjectId(businessId) });
  }

  const conn = await CalendarConnectionModel.findOne({
    isActive: true,
    $or: ors,
  }).lean();

  if (!conn) {
    throw new Error(`No active calendar connection for businessId=${businessId}`);
  }

  if (conn.provider === "google") {
    if (!conn.googleRefreshToken) {
      throw new Error("Google refresh token missing (business not connected yet).");
    }

    return createGoogleProvider({
      refreshToken: conn.googleRefreshToken,
      calendarId: conn.calendarId || "primary",
    });
  }

  throw new Error(`Unsupported calendar provider: ${conn.provider}`);
}

import mongoose from "mongoose";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI in env");

  if (mongoose.connection.readyState === 1) return; // already connected

  await mongoose.connect(uri);
  console.log("[DB] connected");
}
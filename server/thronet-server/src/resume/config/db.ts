/**
 * src/resume/config/db.ts
 * Adapter: throne8-servers already manages the MongoDB connection via MongoConnection.
 * resume module's models will use the same active mongoose connection — no re-connect needed.
 * This stub is kept for import compatibility.
 */
import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  // Connection is already handled by throne8-servers' MongoConnection.
  // Resume models use a separate dbName via their own schema collection names (no conflict).
  if (mongoose.connection.readyState === 0) {
    console.warn('[Resume] MongoDB not yet connected. Ensure MongoConnection.connect() ran first.');
  } else {
    console.log('[Resume] Using existing MongoDB connection (readyState:', mongoose.connection.readyState, ')');
  }
};

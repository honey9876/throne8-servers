//server/thronet-server/src/config/features.ts
import dotenv from "dotenv";
import path from "path";

// Ensure root and server .env files are loaded before reading flags
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config();

const readFlag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
};

export const FEATURES = {
  // Core: hamesha on
  auth: true,
  profile: true,
  mentorship: true,
  notifications: true,

  // Optional: default off
  connections: readFlag('ENABLE_CONNECTIONS', false),
  company: readFlag('ENABLE_COMPANY', false),
  messaging: readFlag('ENABLE_MESSAGING', false),
  studyGroup: true, // Always enabled — env flag bypassed due to dotenv load-order issue
  jobService: readFlag('ENABLE_JOB_SERVICE', false),

  // Resume Builder — default ON (merged from resume12)
  resumeBuilder: readFlag('ENABLE_RESUME_BUILDER', true),
} as const;

export type FeatureName = keyof typeof FEATURES;

export const enabledFeatures = (): string[] =>
  Object.entries(FEATURES)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
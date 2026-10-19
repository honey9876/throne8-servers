/**
 * src/resume/config/env.ts
 * Adapter: bridges resume12's env interface to throne8-servers' global process.env.
 * dotenv is already loaded by server.ts at startup — no re-loading needed.
 */

export const env = {
  PORT: Number(process.env['PORT']) || 4000,
  MONGODB_URI: process.env['MONGODB_URI']!,
  JWT_SECRET: process.env['JWT_SECRET'] || process.env['JWT_ACCESS_SECRET']!,
  JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] || process.env['ACCESS_TOKEN_EXPIRY'] || '7d',
  GEMINI_API_KEY: process.env['RESUME_GEMINI_API_KEY'] || process.env['GEMINI_API_KEY']!,
  GEMINI_MODEL: process.env['RESUME_GEMINI_MODEL'] || process.env['GEMINI_MODEL'] || 'gemini-2.5-flash',
  GEMINI_TTS_MODEL: process.env['GEMINI_TTS_MODEL'] || 'gemini-2.5-flash-preview-tts',
  GEMINI_TTS_VOICE: process.env['GEMINI_TTS_VOICE'] || 'Kore',
};
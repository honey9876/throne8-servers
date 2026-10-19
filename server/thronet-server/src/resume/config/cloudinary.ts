/**
 * src/resume/config/cloudinary.ts
 * Adapter: configure cloudinary for the resume module.
 * Uses throne8-servers' env vars (CLOUDINARY_CLOUD_NAME, etc.)
 */
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME']!,
  api_key: process.env['CLOUDINARY_API_KEY']!,
  api_secret: process.env['CLOUDINARY_API_SECRET']!,
  secure: true,
});

export default cloudinary;
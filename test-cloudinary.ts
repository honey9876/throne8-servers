import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: process.env.CLOUDINARY_SECURE_URLS === 'true'
});

async function checkCloudinary() {
  try {
    console.log('Testing Cloudinary connection with cloud_name:', process.env.CLOUDINARY_CLOUD_NAME);
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary Ping Result:', result);
    console.log('✅ Cloudinary is working perfectly!');
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error);
  }
}

checkCloudinary();

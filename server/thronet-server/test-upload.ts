import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: process.env.CLOUDINARY_SECURE_URLS === 'true'
});

async function testUpload() {
  return new Promise((resolve, reject) => {
    // Create a simple tiny 1x1 transparent PNG buffer
    const buf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    
    console.log('Initiating upload stream to Cloudinary...');
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'test-folder',
        public_id: `test_upload_${Date.now()}`,
        resource_type: 'image',
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary stream upload failed:', error);
          return reject(error);
        }
        console.log('✅ Cloudinary stream upload succeeded:', result);
        resolve(result);
      }
    );
    uploadStream.end(buf);
  });
}

testUpload()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });

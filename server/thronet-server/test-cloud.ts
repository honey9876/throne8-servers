import cloudinary from './src/config/images/store/cloudinary/cloudinary.config';
console.log(cloudinary !== undefined);
const requiredCloudinary = require('./src/config/images/store/cloudinary/cloudinary.config').default;
console.log(requiredCloudinary !== undefined);

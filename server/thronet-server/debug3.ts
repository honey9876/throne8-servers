import dotenv from 'dotenv';
dotenv.config();
import { app, NotificationService } from './src/app';
console.log("App imported successfully!");

setTimeout(() => {
    console.log("Exiting test");
    process.exit(1);
}, 3000);

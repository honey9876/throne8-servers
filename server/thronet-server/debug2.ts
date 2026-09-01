import dotenv from 'dotenv';
dotenv.config();
import { app } from './src/app';
console.log("App imported successfully!");

// import MongoConnection from './src/database/sharding/connection';
// console.log("MongoConnection imported!");

setTimeout(() => {
    console.log("Exiting test");
    process.exit(1);
}, 3000);

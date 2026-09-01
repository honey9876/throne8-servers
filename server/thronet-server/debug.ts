import { app } from './src/app';
console.log("App imported successfully!");
setTimeout(() => {
    console.log("Dumping active handles:");
    console.log(process._getActiveHandles());
    console.log("Dumping active requests:");
    console.log(process._getActiveRequests());
    process.exit(1);
}, 3000);

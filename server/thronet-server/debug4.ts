import dotenv from 'dotenv';
dotenv.config();

import { app, NotificationService } from './src/app';
import MongoConnection from './src/database/sharding/connection';
import CacheUtil from './src/shared/cache.util';
import AuditConsumer from './src/shared/kafka/producers/audit.consumer';

console.log("Using them:", app.name, NotificationService, MongoConnection, CacheUtil, AuditConsumer);
console.log("All imported successfully!");
setTimeout(() => {
    console.log("Exiting test");
    process.exit(1);
}, 3000);

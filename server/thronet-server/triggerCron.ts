import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';
import ProfileViewDigestCron from './src/jobs/profileViewDigestCron';
import MongoConnection from './src/database/sharding/connection';

async function run() {
    console.log('Connecting to DB...');
    await MongoConnection.connect();
    console.log('Running triggerManually()...');
    await ProfileViewDigestCron.triggerManually();
    console.log('Done.');
    process.exit(0);
}
run();

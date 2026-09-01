import dotenv from 'dotenv';
dotenv.config({ path: '../throne8-server/server/thronet-server/.env' });

import MongoConnection from './src/database/sharding/connection';
import { User } from './src/auth/models';
import AuthService from './src/auth/services/auth.service';
import CacheUtil from './src/shared/cache.util';

async function testProfileResolution() {
  try {
    console.log('Connecting to database...');
    await MongoConnection.connect();
    console.log('Database connected.');

    // Find any user
    const user = await User.findOne({});
    if (!user) {
      console.log('No user found in the database!');
      process.exit(1);
    }
    
    console.log(`Testing profile resolution for User: ${user.email} (userId: ${user.userId})`);
    
    // Invalidate profile cache so we query from DB
    await CacheUtil.init();
    await CacheUtil.del(`user:profile:${user.userId}`);
    
    const profile = await AuthService.getUserProfile(user.userId);
    console.log('Returned Profile Object:', JSON.stringify(profile, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing profile resolution:', error);
    process.exit(1);
  }
}

testProfileResolution();

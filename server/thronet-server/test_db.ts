import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
import { Follow } from './src/connections/models/Follow';

async function check() {
  await mongoose.connect(uri!);
  try {
    const count = await Follow.getFollowersCount('bbb4bb47-d281-4192-a49c-e352162db35e');
    console.log('API WOULD RETURN Count:', count);
  } catch (err) {
    console.error('API WOULD RETURN Error:', err);
  }
  mongoose.disconnect();
}
check();

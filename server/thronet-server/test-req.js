import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await mongoose.connect('mongodb://localhost:27017/throne8');
  const reqs = await mongoose.connection.db.collection('connectionrequests').find().toArray();
  console.log('Total Requests:', reqs.length);
  console.log(JSON.stringify(reqs, null, 2));
  process.exit(0);
}
check();

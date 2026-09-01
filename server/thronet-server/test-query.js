import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const schema = new mongoose.Schema({
    toUserId: String,
    status: String,
    createdAt: Date
  }, { collection: 'connectionrequests' });
  
  const ConnectionRequest = mongoose.models.ConnectionRequest || mongoose.model('ConnectionRequest', schema);
  
  const authUserId = "bbb4bb47-d281-4192-a49c-e352162db35e";
  
  const reqs = await ConnectionRequest.find({
    toUserId: authUserId,
    status: 'pending'
  }).sort({ createdAt: -1 }).lean();
  
  console.log('Results for toUserId', authUserId, ':', reqs.length);
  console.log(reqs);
  
  process.exit(0);
}
test();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const schema = new mongoose.Schema({ status: String });
  const TestModel = mongoose.model('TestModel', schema, 'connectionrequests');
  
  try {
    const q = TestModel.find({ status: 'pending' });
    const count = await q.clone().estimatedDocumentCount();
    console.log('Count:', count);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
test();

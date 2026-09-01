import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/throne8';

async function test() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');
  const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }));
  const posts = await Post.find({}).lean().exec();
  console.log('Total Post Documents:', posts.length);
  if (posts.length > 0) {
     console.log('Sample UserID from Post:', posts[0].userId);
     console.log('Sample Post entries count:', posts[0].posts?.length);
  }

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const users = await User.find({}).lean().exec();
  console.log('Total Users:', users.length);
  if (users.length > 0) {
     console.log('Sample User userId:', users[0].userId);
     console.log('Sample User _id:', users[0]._id.toString());
  }
  process.exit(0);
}
test();

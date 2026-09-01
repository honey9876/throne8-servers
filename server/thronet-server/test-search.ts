import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Message from './src/message/models/messaging.model';

dotenv.config({ path: '.env' });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/throne8';

async function test() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');
    
    console.log('Syncing indexes...');
    await Message.createIndexes();
    console.log('Indexes synced successfully!');
    
    // Find a message to get conversationId
    const sampleMsg = await Message.findOne({});
    if (!sampleMsg) {
      console.log('No messages found in DB');
      process.exit(0);
    }
    
    console.log('Found sample message:', sampleMsg.messageId, 'conv:', sampleMsg.conversationId);
    
    // Test text search
    const results = await Message.find(
      {
        conversationId: sampleMsg.conversationId,
        isDeleted: false,
        $text: { $search: 'test' },
      },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } });
    
    console.log('Search results:', results.length);
  } catch (err) {
    console.error('Error during search test:', err);
  }
  process.exit(0);
}

test();

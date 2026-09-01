import mongoose from 'mongoose';
import User from './src/auth/models/User.model.js';
import Post from './src/Profile/models/Post.model.js';

async function test() {
    try {
        await mongoose.connect('mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4');
        
        const allUserDocs = await Post.find({}).lean();
        const userIds = [...new Set(allUserDocs.map((doc) => doc.userId))];
        console.log("Found userIds in Post:", userIds.length, userIds.slice(0, 5));
        
        const users = await User.find({ userId: { $in: userIds } })
            .select('userId username firstName lastName')
            .lean();
        
        console.log("Users found in DB:", users.length);
        console.log("First 3 Users:", users.slice(0, 3));
        
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();

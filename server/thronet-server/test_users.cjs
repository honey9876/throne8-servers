const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect('mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4');
        const db = mongoose.connection.db;
        
        const posts = await db.collection('posts').find({}).toArray();
        const userIds = [...new Set(posts.map(p => p.userId))];
        
        const users = await db.collection('users').find({ userId: { $in: userIds } }).toArray();
        
        const userMap = users.reduce((acc, user) => {
            acc[user.userId] = user;
            return acc;
        }, {});
        
        let authorNames = [];
        posts.forEach(doc => {
            const author = userMap[doc.userId] || {};
            const name = author.firstName ? `${author.firstName} ${author.lastName || ''}`.trim() : (author.username || 'Throne8 User');
            authorNames.push({ userId: doc.userId, name });
        });
        
        console.log("Mapped author names:", authorNames);
        
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();

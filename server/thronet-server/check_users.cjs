const mongoose = require('mongoose');

async function check() {
    try {
        await mongoose.connect('mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4');
        const db = mongoose.connection.db;
        
        const posts = await db.collection('posts').find({}).toArray();
        const userIds = [...new Set(posts.map(p => p.userId))];
        
        const users = await db.collection('users').find({ userId: { $in: userIds } }).toArray();
        
        users.forEach(u => {
            console.log(`User: ${u.userId}, firstName: ${u.firstName}, lastName: ${u.lastName}, username: ${u.username}`);
        });
        
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();

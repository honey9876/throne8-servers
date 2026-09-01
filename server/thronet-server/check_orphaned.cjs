const mongoose = require('mongoose');

async function check() {
    try {
        await mongoose.connect('mongodb+srv://practic:practic@cluster1.mantd.mongodb.net/Throne8_App?retryWrites=true&w=majority&family=4');
        const db = mongoose.connection.db;
        
        const posts = await db.collection('posts').find({}).toArray();
        const userIds = [...new Set(posts.map(p => p.userId))];
        
        const users = await db.collection('users').find({ userId: { $in: userIds } }).toArray();
        const foundUserIds = new Set(users.map(u => u.userId));
        
        const orphaned = userIds.filter(id => !foundUserIds.has(id));
        
        console.log(`Total unique userIds in posts: ${userIds.length}`);
        console.log(`Total users found: ${foundUserIds.size}`);
        console.log(`Orphaned userIds (no matching user): ${orphaned.length}`);
        
        if (orphaned.length > 0) {
            console.log("First 3 orphaned userIds:", orphaned.slice(0, 3));
            
            // Let's see how many posts are orphaned
            let orphanedPostCount = 0;
            posts.forEach(doc => {
                if (orphaned.includes(doc.userId)) {
                    orphanedPostCount += (doc.posts ? doc.posts.length : 0);
                }
            });
            console.log(`Total individual posts belonging to orphaned users: ${orphanedPostCount}`);
        }
        
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();

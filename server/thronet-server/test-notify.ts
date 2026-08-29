import * as dotenv from 'dotenv';
import * as path from 'path';

// Run dotenv config first before importing anything that uses env variables!
dotenv.config({ path: path.join(__dirname, '../../.env') });

import mongoose from 'mongoose';
import User from './src/auth/models/User.model';
import { Follow } from './src/connections/models/Follow';
import Connection from './src/connections/models/Connection';
import Notification from './src/notifications/models/Notification.model';

async function run() {
    try {
        // Dynamically import PostService so that env variables are loaded first
        const PostService = (await import('./src/Profile/services/activity/post.service')).default;

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error('MONGODB_URI not found');
            process.exit(1);
        }
        await mongoose.connect(uri);
        console.log('Connected to DB');

        // Poster: Anjali Dwivedi (userId: 28d35563-6b07-4e0a-a435-12dff947a06e)
        // Follower: Nisita Chandel (userId: 37eb8ab5-90ab-4852-b7aa-dcfe5abe16f7)
        const posterId = '28d35563-6b07-4e0a-a435-12dff947a06e';

        // 1. Let's see all active follows for the poster
        const follows = await Follow.find({
            followingId: posterId,
            status: 'active',
            isBlocked: false
        }).lean();
        console.log('Followers in DB:', follows.map(f => f.followerId));

        // 2. Let's see all active connections for the poster
        const conns = await Connection.find({
            $or: [{ fromUserId: posterId }, { toUserId: posterId }],
            status: 'active',
            isArchived: false
        }).lean();
        const connectedUserIds = conns.map(c => c.fromUserId === posterId ? c.toUserId : c.fromUserId);
        console.log('Connections in DB:', connectedUserIds);

        // 3. Clear previous notifications
        await Notification.deleteMany({ senderId: posterId, type: 'post_created' });
        console.log('Cleared existing post_created notifications for sender:', posterId);

        console.log('Simulating PostService.createPost...');
        const result = await PostService.createPost(posterId, {
            title: 'Diagnostic Post title for followers and connections',
            content: 'Hello followers and connections!',
            isPublic: true,
        });

        console.log('Post created successfully:', result);

        console.log('Waiting 3 seconds for setTimeout(..., 0) callbacks to run...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if follow notifications are created in DB
        const createdNotifications = await Notification.find({
            senderId: posterId,
            type: 'post_created',
        }).lean();

        console.log('Created Notifications count:', createdNotifications.length);
        console.log('Created Notifications details:');
        createdNotifications.forEach((n, idx) => {
            console.log(`[${idx + 1}] Recipient: ${n.recipientId}, Name: ${n.senderName}, Photo: ${n.senderPhoto}`);
        });

        process.exit(0);
    } catch (err: any) {
        console.error('Test run failed:', err);
        process.exit(1);
    }
}
run();

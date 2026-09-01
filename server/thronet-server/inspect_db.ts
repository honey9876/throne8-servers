import 'dotenv/config';
import mongoose from 'mongoose';
import Mentor from './src/Mentorship/models/Mentor';
import { User } from './src/shared/models/index.models';
import config from './src/config/env/env';

async function main() {
    await mongoose.connect(config.MONGODB_URI);
    console.log("Connected to MongoDB");
    
    const users = await User.find({}).lean();
    console.log("Users in DB:", users.map(u => ({
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        aadhaarVerified: u.aadhaarVerified,
        companyEmailVerified: u.companyEmailVerified
    })));
    
    const mentors = await Mentor.find({}).lean();
    console.log("Mentors in DB:", mentors);
    
    await mongoose.disconnect();
}

main().catch(console.error);

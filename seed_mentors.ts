import 'dotenv/config';
import mongoose from 'mongoose';
import Mentor from './src/Mentorship/models/Mentor';
import { User } from './src/shared/models/index.models';
import config from './src/config/env/env';

async function main() {
    await mongoose.connect(config.MONGODB_URI);
    console.log("Connected to MongoDB");
    
    // 1. Update Ujjwal Tiwari (3cd22124-ff4b-4c5a-983c-a910bf9a6987) to active
    const ujjwalUser = await User.findOne({ userId: '3cd22124-ff4b-4c5a-983c-a910bf9a6987' });
    if (ujjwalUser) {
        ujjwalUser.emailVerified = true;
        ujjwalUser.phoneVerified = true;
        ujjwalUser.aadhaarVerified = true;
        ujjwalUser.companyEmailVerified = true;
        ujjwalUser.role = 'user';
        await ujjwalUser.save();
        console.log("Updated Ujjwal's user verification status.");
    }
    
    await Mentor.findOneAndUpdate(
        { userId: '3cd22124-ff4b-4c5a-983c-a910bf9a6987' },
        {
            status: 'active',
            title: 'Lead Mobile Developer',
            bio: 'Expert in React Native, Android development, and hybrid mobile application architectures with over 5 years of industry experience.',
            tagline: 'Building the future of mobile apps',
            domains: ['mobile_development', 'web_development'],
            skills: ['React Native', 'JavaScript', 'TypeScript', 'Android', 'Redux'],
            languages: ['English', 'Hindi'],
            experience: {
                total: 5,
                level: 'senior',
                currentRole: 'Lead Mobile Developer at Google',
                previousRoles: [
                    { title: 'Software Engineer', company: 'Google', duration: '3 Years' }
                ]
            },
            pricing: {
                quickCall: 1000,
                deepDive: 2500,
                resumeReview: 800,
                mockInterview: 1500
            }
        },
        { upsert: true, new: true }
    );
    console.log("Updated Ujjwal's mentor profile to active.");

    // 2. Create/update Rishab (bbb4bb47-d281-4192-a49c-e352162db35e) as active mentor
    const rishabUser = await User.findOne({ userId: 'bbb4bb47-d281-4192-a49c-e352162db35e' });
    if (rishabUser) {
        rishabUser.emailVerified = true;
        rishabUser.phoneVerified = true;
        rishabUser.aadhaarVerified = true;
        rishabUser.companyEmailVerified = true;
        rishabUser.role = 'user';
        await rishabUser.save();
    }
    await Mentor.findOneAndUpdate(
        { userId: 'bbb4bb47-d281-4192-a49c-e352162db35e' },
        {
            status: 'active',
            title: 'Product Lead at Google',
            bio: 'Product management leader with 8+ years of experience leading cross-functional teams at Google, Meta, and startups.',
            tagline: 'Learn Product Management from FAANG Leaders',
            domains: ['product_management', 'management'],
            skills: ['Product Strategy', 'Roadmapping', 'Agile', 'Figma', 'Analytics'],
            experience: {
                total: 8,
                level: 'lead',
                currentRole: 'Product Lead @ Google',
                previousRoles: [
                    { title: 'Senior Product Manager', company: 'Meta', duration: '3 Years' }
                ]
            },
            pricing: {
                quickCall: 1500,
                deepDive: 3500,
                resumeReview: 1200,
                mockInterview: 2000
            }
        },
        { upsert: true, new: true }
    );
    console.log("Seeded Rishab mentor profile.");

    // 3. Create/update Abhishek (d5c59c68-0973-40aa-9997-b682097d59ae) as active mentor
    const abhishekUser = await User.findOne({ userId: 'd5c59c68-0973-40aa-9997-b682097d59ae' });
    if (abhishekUser) {
        abhishekUser.emailVerified = true;
        abhishekUser.phoneVerified = true;
        abhishekUser.aadhaarVerified = true;
        abhishekUser.companyEmailVerified = true;
        abhishekUser.role = 'user';
        await abhishekUser.save();
    }
    await Mentor.findOneAndUpdate(
        { userId: 'd5c59c68-0973-40aa-9997-b682097d59ae' },
        {
            status: 'active',
            title: 'Staff Engineer at Netflix',
            bio: 'Specialist in distributed systems, high-performance backends, and cloud native system design with over 12 years of experience.',
            tagline: 'Scale systems and your engineering career',
            domains: ['web_development', 'systems_engineering'],
            skills: ['Backend', 'Distributed Systems', 'Go', 'Kubernetes', 'AWS'],
            experience: {
                total: 12,
                level: 'principal',
                currentRole: 'Staff Engineer @ Netflix',
                previousRoles: [
                    { title: 'Senior Backend Engineer', company: 'Amazon', duration: '4 Years' }
                ]
            },
            pricing: {
                quickCall: 2500,
                deepDive: 6000,
                resumeReview: 1500,
                mockInterview: 3000
            }
        },
        { upsert: true, new: true }
    );
    console.log("Seeded Abhishek mentor profile.");

    // 4. Create/update Nisita (9e0dbd7b-d590-4ec7-8158-6be98333779d) as active mentor
    const nisitaUser = await User.findOne({ userId: '9e0dbd7b-d590-4ec7-8158-6be98333779d' });
    if (nisitaUser) {
        nisitaUser.emailVerified = true;
        nisitaUser.phoneVerified = true;
        nisitaUser.aadhaarVerified = true;
        nisitaUser.companyEmailVerified = true;
        nisitaUser.role = 'user';
        await nisitaUser.save();
    }
    await Mentor.findOneAndUpdate(
        { userId: '9e0dbd7b-d590-4ec7-8158-6be98333779d' },
        {
            status: 'active',
            title: 'Data Scientist at Spotify',
            bio: 'Passionate about machine learning, recommendation systems, and data-driven product decisions with 6 years of industry experience.',
            tagline: 'Unlocking insights with Machine Learning',
            domains: ['data_science', 'artificial_intelligence'],
            skills: ['AI/ML', 'Python', 'PyTorch', 'TensorFlow', 'Data Science'],
            experience: {
                total: 6,
                level: 'senior',
                currentRole: 'Data Scientist @ Spotify',
                previousRoles: [
                    { title: 'ML Research Engineer', company: 'OpenAI', duration: '2 Years' }
                ]
            },
            pricing: {
                quickCall: 2200,
                deepDive: 5000,
                resumeReview: 1200,
                mockInterview: 2500
            }
        },
        { upsert: true, new: true }
    );
    console.log("Seeded Nisita mentor profile.");
    
    await mongoose.disconnect();
    console.log("Seeding complete.");
}

main().catch(console.error);

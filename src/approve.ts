import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const MONGODB_URI = 'mongodb+srv://throne8pvtltd_db_user:Thronet2026Prodapp@throne8-application.cdl2zj5.mongodb.net/thronet_production?retryWrites=true&w=majority&appName=Throne8-Application';

// Schemas
const applicationSchema = new mongoose.Schema({},{ strict: false });
const mentorSchema = new mongoose.Schema({},{ strict: false });
const userSchema = new mongoose.Schema({},{ strict: false });

const Application = mongoose.model('Application', applicationSchema, 'senior_mentor_applications');
const Mentor = mongoose.model('Mentor', mentorSchema, 'mentors');
const User = mongoose.model('User', userSchema, 'users');

async function approveWorkflow() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Find the latest PENDING application
    const app = await Application.findOne({ verificationStatus: 'PENDING' }).sort({ createdAt: -1 }).lean() as any;
    
    if (!app) {
      console.log('❌ No pending applications found in the database. Are you sure you submitted it?');
      process.exit(1);
    }
    
    console.log(`📌 Found pending application for User ID: ${app.userId}`);
    
    // 2. Validate User exists
    const user = await User.findOne({ userId: app.userId });
    if (!user) {
      console.log(`❌ Target User missing in users collection...`);
      process.exit(1);
    }

    // 3. Mark Application as VERIFIED
    await Application.collection.updateOne(
      { _id: app._id },
      {
        $set: {
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedBy: 'system-admin-script',
          updatedAt: new Date(),
        }
      }
    );
    console.log('✅ Senior Mentor Application successfully marked as VERIFIED!');

    // 4. Create Mentor Profile automatically
    const existingMentor = await Mentor.findOne({ userId: app.userId }).lean();
    if (existingMentor) {
       console.log('⚠️ Mentor profile already exists for this user. Approving them directly...');
       await Mentor.collection.updateOne(
         { userId: app.userId },
         { $set: { status: 'ACTIVE', updatedAt: new Date() } }
       );
       console.log('✅ Mentor Profile set to ACTIVE!');
    } else {
       console.log('📌 Creating Mentor Profile seamlessly...');
       // Construct a basic active mentor profile drawing from the application data
       const newMentor = {
         mentorId: randomUUID(),
         userId: app.userId,
         status: 'ACTIVE', // Instantly active
         profilePic: app.profilePhoto, 
         companyId: null, // Assuming no company ID link strictly necessary right now
         skills: app.skills,
         domains: app.domains,
         languages: ['English'], // Default reasonable fallback
         experience: {
           total: app.experience.totalYears,
           currentRole: app.professionalDetails.currentRole + ' at ' + app.professionalDetails.company,
           level: 'SENIOR',
         },
         pricing: {
           quickCall: 100, deepDive: 300, resumeReview: 150,
           mockInterview: 250, careerPlanning: 200, portfolioReview: 200,
           askQuery: 50, groupSession: 0
         },
         preferences: {
           acceptGroupSessions: true, maxGroupSize: 10,
           acceptQueries: true, maxQueriesPerWeek: 10,
           notificationPreferences: { email: true, sms: false, push: true }
         },
         availability: {
           timezone: 'Asia/Kolkata', daysAvailable: ['monday', 'wednesday', 'friday'],
           timeSlots: [{ startTime: '10:00', endTime: '18:00' }]
         },
         stats: { averageRating: 5.0, totalReviews: 0, totalSessions: 0, totalMentees: 0 },
         isDeleted: false,
         createdAt: new Date(),
         updatedAt: new Date(),
       };

       await Mentor.collection.insertOne(newMentor);
       console.log(`✅ Success! User ${app.userId} has officially become an ACTIVE MENTOR!`);
    }

    process.exit(0);
  } catch(error) {
    console.error('Crash:', error);
    process.exit(1);
  }
}

approveWorkflow();

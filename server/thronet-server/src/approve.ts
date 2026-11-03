import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const MONGODB_URI = (process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/throne8') as string;

// Dynamic Schemas
const applicationSchema = new mongoose.Schema({}, { strict: false });
const mentorSchema = new mongoose.Schema({}, { strict: false });
const userSchema = new mongoose.Schema({}, { strict: false });

const Application = mongoose.model('Application', applicationSchema, 'seniormentorapplications');
const ApplicationAlt = mongoose.model('ApplicationAlt', applicationSchema, 'senior_mentor_applications');
const Mentor = mongoose.model('Mentor', mentorSchema, 'mentors');
const User = mongoose.model('User', userSchema, 'users');

async function approveWorkflow() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Find the latest pending application across both collection name variations
    let app = await Application.findOne({
      verificationStatus: { $in: ['pending', 'PENDING', 'under_review', 'UNDER_REVIEW'] },
    })
      .sort({ createdAt: -1 })
      .lean() as any;

    let targetCollection = Application.collection;

    if (!app) {
      app = await ApplicationAlt.findOne({
        verificationStatus: { $in: ['pending', 'PENDING', 'under_review', 'UNDER_REVIEW'] },
      })
        .sort({ createdAt: -1 })
        .lean() as any;
      if (app) {
        targetCollection = ApplicationAlt.collection;
      }
    }

    if (!app) {
      console.log('❌ No pending applications found in the database. Are you sure you submitted it?');
      process.exit(1);
    }

    console.log(`📌 Found pending application for User ID: ${app.userId}`);

    // 2. Validate User exists (check userId, _id, or id)
    const user =
      (await User.findOne({ userId: app.userId }).lean()) ||
      (await User.findOne({ _id: app.userId }).lean()) ||
      (await User.findOne({ id: app.userId }).lean());

    if (!user) {
      console.log(`⚠️ Target User not found by exact ID, continuing with application userId: ${app.userId}`);
    } else {
      console.log(`✅ Target user verified in users collection.`);
    }

    // 3. Mark Application as VERIFIED (supports both verified and VERIFIED)
    await targetCollection.updateOne(
      { _id: app._id },
      {
        $set: {
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          verifiedBy: 'system-admin-script',
          updatedAt: new Date(),
        },
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

      const skills = [
        ...(Array.isArray(app.skills) ? app.skills : []),
        ...(Array.isArray(app.technologies) ? app.technologies : []),
        ...(Array.isArray(app.otherSkills) ? app.otherSkills : []),
      ].filter((s, idx, arr) => s && arr.indexOf(s) === idx);

      const domain = app.primaryExpertise || (Array.isArray(app.domains) ? app.domains[0] : 'web_development');
      const domains = Array.isArray(app.domains) && app.domains.length > 0 ? app.domains : [domain];

      const currentRole =
        app.currentRole ||
        app.professionalDetails?.currentRole ||
        'Senior Mentor';
      const company =
        app.currentCompany ||
        app.professionalDetails?.company ||
        app.college ||
        'Throne8';

      const totalYears =
        typeof app.yearsOfExperience === 'number'
          ? app.yearsOfExperience
          : app.experience?.totalYears || 1;

      // Construct a basic active mentor profile drawing from application data
      const newMentor = {
        mentorId: randomUUID(),
        userId: app.userId,
        name: app.fullName || (user as any)?.firstName ? `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() : 'Mentor',
        title: currentRole,
        domain,
        domains,
        skills: skills.length > 0 ? skills : ['Mentorship', 'Career Guidance'],
        status: 'ACTIVE',
        profilePic: app.profilePhoto || null,
        companyId: null,
        languages: ['English'],
        experience: {
          total: totalYears,
          currentRole: `${currentRole} at ${company}`,
          level: (app.experienceLevel || 'SENIOR').toUpperCase(),
        },
        pricing: {
          quickCall: 100,
          deepDive: 300,
          resumeReview: 150,
          mockInterview: 250,
          careerPlanning: 200,
          portfolioReview: 200,
          askQuery: 50,
          groupSession: 0,
        },
        preferences: {
          acceptGroupSessions: true,
          maxGroupSize: 10,
          acceptQueries: true,
          maxQueriesPerWeek: 10,
          notificationPreferences: { email: true, sms: false, push: true },
        },
        availability: {
          timezone: 'Asia/Kolkata',
          daysAvailable: ['monday', 'wednesday', 'friday'],
          timeSlots: [{ startTime: '10:00', endTime: '18:00' }],
        },
        stats: {
          averageRating: 5.0,
          totalReviews: 0,
          totalSessions: 0,
          totalMentees: 0,
        },
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await Mentor.collection.insertOne(newMentor);
      console.log(`✅ Success! User ${app.userId} has officially become an ACTIVE MENTOR!`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Crash:', error);
    process.exit(1);
  }
}

approveWorkflow();

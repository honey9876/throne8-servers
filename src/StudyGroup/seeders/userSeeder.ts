/**
 * ====================================
 * USER SEEDER - FIXED VERSION
 * ====================================
 * Seed sample users for testing
 */

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

import bcrypt from 'bcrypt';
import { connectDB } from '@/database/connection';
import { User } from '@/auth/models';
import { UserRole } from '../enums';
import { LoggerUtil } from '@/shared/logger.util';
import { AnyAaaaRecord } from 'node:dns';

/**
 * Sample users data
 * 
 * PHONE NUMBER FORMAT FIXES:
 * - Changed from +919876543210 (13 chars) to 9876543210 (10 chars)
 * - OR use full international format: +91 9876543210 (with space)
 * 
 * Choose one of these formats based on your User model regex:
 */
const sampleUsers = [
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@test.com',
    password: 'Test@123',
    phone: '9876543210',  // 10-digit format
    role: UserRole.STUDENT,
    bio: 'JEE 2025 aspirant. Target: IIT Bombay CSE',
    location: 'Delhi, India',
    university: 'Delhi Public School',
  },
  {
    name: 'Priya Patel',
    email: 'priya.patel@test.com',
    password: 'Test@123',
    phone: '9876543211',
    role: UserRole.STUDENT,
    bio: 'NEET 2025 aspirant. Target: AIIMS Delhi',
    location: 'Ahmedabad, Gujarat',
    university: 'Gujarat Board',
  },
  {
    name: 'Arjun Verma',
    email: 'arjun.verma@test.com',
    password: 'Test@123',
    phone: '9876543212',
    role: UserRole.STUDENT,
    bio: 'CSE student at IIT Delhi. Love coding and algorithms.',
    location: 'Delhi, India',
    university: 'IIT Delhi',
  },
  {
    name: 'Sneha Gupta',
    email: 'sneha.gupta@test.com',
    password: 'Test@123',
    phone: '9876543213',
    role: UserRole.MENTOR,
    bio: 'IIT Bombay Alumni. Helping students crack JEE.',
    location: 'Mumbai, Maharashtra',
    university: 'IIT Bombay',
  },
  {
    name: 'Vikram Singh',
    email: 'vikram.singh@test.com',
    password: 'Test@123',
    phone: '9876543214',
    role: UserRole.STUDENT,
    bio: 'Full Stack Developer. Learning MERN stack.',
    location: 'Bangalore, Karnataka',
    university: 'PES University',
  },
  {
    name: 'Ananya Reddy',
    email: 'ananya.reddy@test.com',
    password: 'Test@123',
    phone: '9876543215',
    role: UserRole.STUDENT,
    bio: 'Data Science enthusiast. Working on ML projects.',
    location: 'Hyderabad, Telangana',
    university: 'IIIT Hyderabad',
  },
  {
    name: 'Rohan Kumar',
    email: 'rohan.kumar@test.com',
    password: 'Test@123',
    phone: '9876543216',
    role: UserRole.STUDENT,
    bio: 'UPSC aspirant. Preparing for Civil Services Exam.',
    location: 'Patna, Bihar',
    university: 'Patna University',
  },
  {
    name: 'Meera Joshi',
    email: 'meera.joshi@test.com',
    password: 'Test@123',
    phone: '9876543217',
    role: UserRole.MENTOR,
    bio: 'English teacher. Helping students improve communication.',
    location: 'Pune, Maharashtra',
    university: 'Fergusson College',
  },
  {
    name: 'Karthik Nair',
    email: 'karthik.nair@test.com',
    password: 'Test@123',
    phone: '9876543218',
    role: UserRole.STUDENT,
    bio: 'CAT aspirant. Target: IIM Ahmedabad.',
    location: 'Kochi, Kerala',
    university: 'St. Stephens College',
  },
  {
    name: 'Aisha Khan',
    email: 'aisha.khan@test.com',
    password: 'Test@123',
    phone: '9876543219',
    role: UserRole.STUDENT,
    bio: 'Medical student. Passionate about Biology.',
    location: 'Lucknow, Uttar Pradesh',
    university: 'King Georges Medical University',
  },
  {
    name: 'Admin User',
    email: 'admin@studygroup.com',
    password: 'Admin@123',
    phone: '9999999999',
    role: UserRole.ADMIN,
    bio: 'System Administrator',
    location: 'Mumbai, India',
    university: 'Study Group Platform',
  },
];

/**
 * Seed users
 */
const seedUsers = async (): Promise<void> => {
  try {
    LoggerUtil.info('🌱 Starting user seeding...');

    // Connect to database
    await connectDB();

    // Clear existing users (optional)
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      LoggerUtil.warn(`⚠️  Found ${existingUsers} existing users`);
      LoggerUtil.info('🗑️  Clearing existing users...');
      await User.deleteMany({});
      LoggerUtil.info('✅ Existing users cleared');
    }

    // Create users
    LoggerUtil.info('\n👥 Creating sample users...');
    const createdUsers = [];

    for (let i = 0; i < sampleUsers.length; i++) {
      const userData = sampleUsers[i];

      if (!userData) {
        LoggerUtil.warn(`⚠️  Skipping user ${i + 1} - no data`);
        continue;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);

      // Create user
      const user = await User.create({
        ...userData,
        password: hashedPassword,
        isEmailVerified: true, // Auto-verify for testing
        emailVerificationToken: undefined,
        emailVerificationExpires: undefined,
      });

      createdUsers.push(user);

      LoggerUtil.info(`   ✅ ${i + 1}. ${user.username} (${user.email}) - ${user.role}`);
    }

    LoggerUtil.info('\n📊 Seeding Summary:');
    LoggerUtil.info(`   ✅ Total users created: ${createdUsers.length}`);
    LoggerUtil.info(`   ✅ Students: ${createdUsers.filter(u => u.role === UserRole.USER).length}`);
    LoggerUtil.info(`   ✅ Mentors: ${createdUsers.filter(u => u.role === UserRole.MENTOR).length}`);
    LoggerUtil.info(`   ✅ Admins: ${createdUsers.filter(u => u.role === UserRole.ADMIN).length}`);

    LoggerUtil.info('\n🔐 Test Credentials:');
    LoggerUtil.info('   📧 Email: rahul.sharma@test.com');
    LoggerUtil.info('   🔑 Password: Test@123');
    LoggerUtil.info('   ─────────────────────────');
    LoggerUtil.info('   📧 Admin Email: admin@studygroup.com');
    LoggerUtil.info('   🔑 Admin Password: Admin@123');

    LoggerUtil.info('\n🎉 User seeding completed successfully!');
    LoggerUtil.info('💡 You can now login with these test accounts');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

/**
 * Clear all users
 */
const clearUsers = async (): Promise<void> => {
  try {
    LoggerUtil.info('🗑️  Clearing all users...');

    await connectDB();

    const userCount = await User.countDocuments();
    await User.deleteMany({});

    LoggerUtil.info(`✅ Deleted ${userCount} users`);
    LoggerUtil.info('✅ All users cleared successfully');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error clearing users:', error);
    process.exit(1);
  }
};

/**
 * Create single admin user
 */
const createAdmin = async (): Promise<void> => {
  try {
    LoggerUtil.info('👑 Creating admin user...');

    await connectDB();

    const existingAdmin = await User.findOne({ email: 'admin@studygroup.com' });

    if (existingAdmin) {
      LoggerUtil.warn('⚠️  Admin user already exists');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);

    await User.create({
      name: 'Admin User',
      email: 'admin@studygroup.com',
      password: hashedPassword,
      phone: '9999999999',
      role: UserRole.ADMIN,
      bio: 'System Administrator',
      isEmailVerified: true,
    });

    LoggerUtil.info('✅ Admin user created successfully');
    LoggerUtil.info('   📧 Email: admin@studygroup.com');
    LoggerUtil.info('   🔑 Password: Admin@123');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

/**
 * Main execution
 */
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'clear') {
    clearUsers();
  } else if (command === 'admin') {
    createAdmin();
  } else {
    seedUsers();
  }
}

export default {
  seedUsers,
  clearUsers,
  createAdmin,
};
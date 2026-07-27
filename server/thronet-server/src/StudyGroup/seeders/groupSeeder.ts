/**
 * ====================================
 * GROUP SEEDER - FIXED VERSION
 * ====================================
 * Seed sample groups with members for testing
 */
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables first

import { connectDB } from '@/database/connection';
import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';
import { User } from '@/auth/models';
import { GroupCategory, GroupVisibility } from '../enums';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * Sample groups data
 */
const sampleGroups = [
  {
    title: 'JEE 2025 Physics Champions',
    description: 'Focused group for JEE Advanced Physics preparation. Daily practice sessions and doubt solving.',
    category: GroupCategory.JEE,
    visibility: GroupVisibility.PUBLIC,
    subjects: ['Physics'],
    dailyGoalHours: 8,
    maxCapacity: 50,
    cameraRequired: true,
  },
  {
    title: 'NEET Biology Masterclass',
    description: 'Complete NEET Biology coverage with NCERT focus. Daily tests and discussions.',
    category: GroupCategory.NEET,
    visibility: GroupVisibility.PUBLIC,
    subjects: ['Biology', 'Zoology', 'Botany'],
    dailyGoalHours: 6,
    maxCapacity: 40,
    cameraRequired: false,
  },
  {
    title: 'DSA Interview Prep 2025',
    description: 'Data Structures and Algorithms practice for tech interviews. LeetCode daily challenges.',
    category: GroupCategory.COLLEGE,
    visibility: GroupVisibility.PUBLIC,
    subjects: ['Data Structures', 'Algorithms', 'Computer Science'],
    dailyGoalHours: 4,
    maxCapacity: 30,
    cameraRequired: false,
  },
  {
    title: 'Full Stack Development Bootcamp',
    description: 'Learn MERN stack from scratch. Build real-world projects together.',
    category: GroupCategory.WORKING_PROFESSIONAL,
    visibility: GroupVisibility.PUBLIC,
    subjects: ['Web Development', 'Programming'],
    dailyGoalHours: 3,
    maxCapacity: 25,
    cameraRequired: false,
  },
  {
    title: 'IIT Bombay CSE Study Group',
    description: 'Private study group for IIT Bombay CSE students. Semester exam preparation.',
    category: GroupCategory.COLLEGE,
    visibility: GroupVisibility.PRIVATE,
    subjects: ['Computer Science', 'Database Management Systems', 'Operating Systems'],
    dailyGoalHours: 5,
    maxCapacity: 20,
    cameraRequired: true,
  },
  {
    title: 'English Speaking Practice',
    description: 'Daily English conversation practice. Improve fluency and confidence.',
    category: GroupCategory.LANGUAGE,  // ✅ Now valid with updated enum
    visibility: GroupVisibility.PUBLIC,
    subjects: ['English'],
    dailyGoalHours: 2,
    maxCapacity: 15,
    cameraRequired: true,
  },
  {
    title: 'UPSC Prelims 2025',
    description: 'UPSC CSE Prelims focused group. Current affairs and NCERT revision.',
    category: GroupCategory.COMPETITIVE,  // ✅ Now valid with updated enum
    visibility: GroupVisibility.PUBLIC,
    subjects: ['UPSC Civil Services'],
    dailyGoalHours: 10,
    maxCapacity: 60,
    cameraRequired: false,
  },
  {
    title: 'Machine Learning Study Circle',
    description: 'Learn ML and AI together. Work on Kaggle competitions and projects.',
    category: GroupCategory.WORKING_PROFESSIONAL,
    visibility: GroupVisibility.PUBLIC,
    subjects: ['Machine Learning', 'Data Science'],
    dailyGoalHours: 3,
    maxCapacity: 35,
    cameraRequired: false,
  },
];

/**
 * Seed groups
 */
const seedGroups = async (): Promise<void> => {
  try {
    LoggerUtil.info('🌱 Starting group seeding...');

    // Connect to database
    await connectDB();

    // Check if users exist
    const users = await User.find({ role: 'student' }).limit(10);

    if (users.length === 0) {
      LoggerUtil.error('❌ No users found! Please run userSeeder first.');
      LoggerUtil.info('💡 Run: npm run seed:users');
      process.exit(1);
    }

    LoggerUtil.info(`✅ Found ${users.length} users in database`);

    // Clear existing groups (optional)
    const existingGroups = await Group.countDocuments();
    if (existingGroups > 0) {
      LoggerUtil.warn(`⚠️  Found ${existingGroups} existing groups`);
      LoggerUtil.info('🗑️  Clearing existing groups...');
      await Group.deleteMany({});
      await GroupMember.deleteMany({});
      LoggerUtil.info('✅ Existing groups cleared');
    }

    // Create groups
    LoggerUtil.info('\n📦 Creating sample groups...');
    const createdGroups = [];

    for (let i = 0; i < sampleGroups.length; i++) {
      const groupData = sampleGroups[i];
      
      // Select random leader from users
      const leader = users[i % users.length];

      if (!leader) {
        LoggerUtil.warn(`⚠️  Skipping group ${i + 1} - no leader available`);
        continue;
      }

      // Create group with LEADER field (not leaderId)
      const group = await Group.create({
        ...groupData,
        leader: leader._id,        // ✅ FIXED: Use 'leader' instead of 'leaderId'
        createdBy: leader._id,
      });

      // Add leader as first member
      await GroupMember.create({
        group: group._id,
        user: leader._id,
        role: 'leader',
        status: 'active',
        joinedAt: new Date(),
      });

      // Add 3-5 random members to each group
      const numMembers = Math.floor(Math.random() * 3) + 3; // 3 to 5 members
      const memberIndices = new Set<number>();
      
      while (memberIndices.size < Math.min(numMembers, users.length - 1)) {
        const randomIndex = Math.floor(Math.random() * users.length);
        const randomUser = users[randomIndex];
        
        if (randomUser && leader && randomUser._id.toString() !== leader._id.toString()) {
          memberIndices.add(randomIndex);
        }
      }

      for (const index of memberIndices) {
        const member = users[index];
        if (member) {
          await GroupMember.create({
            group: group._id,
            user: member._id,
            role: 'member',
            status: 'active',
            joinedAt: new Date(),
          });
        }
      }

      // Update member count in group
      const memberCount = await GroupMember.countDocuments({
        group: group._id,
        status: 'active',
      });

      await Group.findByIdAndUpdate(group._id, {
        $set: { memberCount: memberCount }
      });

      createdGroups.push(group);

      LoggerUtil.info(`✅ ${i + 1}. ${group.title} (${memberCount} members) - Leader: ${leader.username}`);
    }

    LoggerUtil.info('\n📊 Seeding Summary:');
    LoggerUtil.info(`   ✅ Groups created: ${createdGroups.length}`);
    LoggerUtil.info(`   ✅ Total members added: ${await GroupMember.countDocuments()}`);
    LoggerUtil.info(`   ✅ Public groups: ${createdGroups.filter(g => g.visibility === GroupVisibility.PUBLIC).length}`);
    LoggerUtil.info(`   ✅ Private groups: ${createdGroups.filter(g => g.visibility === GroupVisibility.PRIVATE).length}`);

    // Show category breakdown
    LoggerUtil.info('\n📚 Groups by Category:');
    LoggerUtil.info(`   📐 JEE: ${createdGroups.filter(g => g.category === GroupCategory.JEE).length}`);
    LoggerUtil.info(`   🏥 NEET: ${createdGroups.filter(g => g.category === GroupCategory.NEET).length}`);
    LoggerUtil.info(`   🎓 College: ${createdGroups.filter(g => g.category === GroupCategory.COLLEGE).length}`);
    LoggerUtil.info(`   💼 Working Professional: ${createdGroups.filter(g => g.category === GroupCategory.WORKING_PROFESSIONAL).length}`);
    LoggerUtil.info(`   🌍 Language: ${createdGroups.filter(g => g.category === GroupCategory.LANGUAGE).length}`);
    LoggerUtil.info(`   📚 Competitive: ${createdGroups.filter(g => g.category === GroupCategory.COMPETITIVE).length}`);

    LoggerUtil.info('\n🎉 Group seeding completed successfully!');
    LoggerUtil.info('💡 You can now test the app with these sample groups');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error seeding groups:', error);
    process.exit(1);
  }
};

/**
 * Clear all groups
 */
const clearGroups = async (): Promise<void> => {
  try {
    LoggerUtil.info('🗑️  Clearing all groups...');

    await connectDB();

    const groupCount = await Group.countDocuments();
    const memberCount = await GroupMember.countDocuments();

    await Group.deleteMany({});
    await GroupMember.deleteMany({});

    LoggerUtil.info(`✅ Deleted ${groupCount} groups`);
    LoggerUtil.info(`✅ Deleted ${memberCount} group members`);
    LoggerUtil.info('✅ All groups cleared successfully');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error clearing groups:', error);
    process.exit(1);
  }
};

/**
 * Main execution
 */
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'clear') {
    clearGroups();
  } else {
    seedGroups();
  }
}

export default {
  seedGroups,
  clearGroups,
};
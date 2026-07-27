/**
 * ====================================
 * BADGE SEEDER
 * ====================================
 * Seeds the database with default badges
 * Run: npm run seed:badges
 */
import dotenv from 'dotenv'; // ✅ ADD THIS
import { connectDB } from '@/database/connection';
import Badge from '../models/Badge.model';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * Default badges to seed
 */
dotenv.config();
const defaultBadges = [
  // ========================================
  // STREAK BADGES
  // ========================================
  {
    name: 'Week Warrior',
    description: 'Maintain a 7-day study streak',
    icon: '🔥',
    category: 'streak',
    requirement: 7,
    requirementType: 'days',
    tier: 'bronze',
    points: 10,
    order: 1,
  },
  {
    name: 'Consistency King',
    description: 'Maintain a 30-day study streak',
    icon: '⚡',
    category: 'streak',
    requirement: 30,
    requirementType: 'days',
    tier: 'silver',
    points: 25,
    order: 2,
  },
  {
    name: 'Unstoppable Force',
    description: 'Maintain a 100-day study streak',
    icon: '💫',
    category: 'streak',
    requirement: 100,
    requirementType: 'days',
    tier: 'gold',
    points: 50,
    order: 3,
  },
  {
    name: 'Legend of Discipline',
    description: 'Maintain a 365-day study streak',
    icon: '👑',
    category: 'streak',
    requirement: 365,
    requirementType: 'days',
    tier: 'platinum',
    points: 100,
    order: 4,
  },

  // ========================================
  // STUDY HOURS BADGES
  // ========================================
  {
    name: 'First Steps',
    description: 'Complete your first study hour',
    icon: '🎯',
    category: 'hours',
    requirement: 1,
    requirementType: 'hours',
    tier: 'bronze',
    points: 5,
    order: 5,
  },
  {
    name: 'Study Enthusiast',
    description: 'Complete 10 hours of study',
    icon: '📚',
    category: 'hours',
    requirement: 10,
    requirementType: 'hours',
    tier: 'bronze',
    points: 10,
    order: 6,
  },
  {
    name: 'Dedicated Learner',
    description: 'Complete 50 hours of study',
    icon: '📖',
    category: 'hours',
    requirement: 50,
    requirementType: 'hours',
    tier: 'silver',
    points: 25,
    order: 7,
  },
  {
    name: 'Century Scholar',
    description: 'Complete 100 hours of study',
    icon: '🎓',
    category: 'hours',
    requirement: 100,
    requirementType: 'hours',
    tier: 'gold',
    points: 50,
    order: 8,
  },
  {
    name: 'Master of Knowledge',
    description: 'Complete 500 hours of study',
    icon: '🏆',
    category: 'hours',
    requirement: 500,
    requirementType: 'hours',
    tier: 'platinum',
    points: 100,
    order: 9,
  },

  // ========================================
  // TASK BADGES
  // ========================================
  {
    name: 'Task Starter',
    description: 'Complete your first task',
    icon: '✅',
    category: 'task',
    requirement: 1,
    requirementType: 'count',
    tier: 'bronze',
    points: 5,
    order: 10,
  },
  {
    name: 'Task Master',
    description: 'Complete 10 tasks',
    icon: '📝',
    category: 'task',
    requirement: 10,
    requirementType: 'count',
    tier: 'bronze',
    points: 10,
    order: 11,
  },
  {
    name: 'Productivity Pro',
    description: 'Complete 50 tasks',
    icon: '🎯',
    category: 'task',
    requirement: 50,
    requirementType: 'count',
    tier: 'silver',
    points: 25,
    order: 12,
  },
  {
    name: 'Task Crusher',
    description: 'Complete 100 tasks',
    icon: '💪',
    category: 'task',
    requirement: 100,
    requirementType: 'count',
    tier: 'gold',
    points: 50,
    order: 13,
  },
  {
    name: 'Ultimate Achiever',
    description: 'Complete 500 tasks',
    icon: '🌟',
    category: 'task',
    requirement: 500,
    requirementType: 'count',
    tier: 'platinum',
    points: 100,
    order: 14,
  },

  // ========================================
  // GOAL BADGES
  // ========================================
  {
    name: 'Goal Setter',
    description: 'Complete your first goal',
    icon: '🎯',
    category: 'goal',
    requirement: 1,
    requirementType: 'count',
    tier: 'bronze',
    points: 5,
    order: 15,
  },
  {
    name: 'Dream Chaser',
    description: 'Complete 5 goals',
    icon: '🌠',
    category: 'goal',
    requirement: 5,
    requirementType: 'count',
    tier: 'bronze',
    points: 10,
    order: 16,
  },
  {
    name: 'Goal Achiever',
    description: 'Complete 20 goals',
    icon: '🏅',
    category: 'goal',
    requirement: 20,
    requirementType: 'count',
    tier: 'silver',
    points: 25,
    order: 17,
  },
  {
    name: 'Ambition Fulfilled',
    description: 'Complete 50 goals',
    icon: '🎖️',
    category: 'goal',
    requirement: 50,
    requirementType: 'count',
    tier: 'gold',
    points: 50,
    order: 18,
  },
  {
    name: 'Visionary',
    description: 'Complete 100 goals',
    icon: '✨',
    category: 'goal',
    requirement: 100,
    requirementType: 'count',
    tier: 'platinum',
    points: 100,
    order: 19,
  },

  // ========================================
  // DOUBT SOLVING BADGES (Helping Others)
  // ========================================
  {
    name: 'Helpful Hand',
    description: 'Answer your first doubt',
    icon: '🤝',
    category: 'doubt',
    requirement: 1,
    requirementType: 'count',
    tier: 'bronze',
    points: 5,
    order: 20,
  },
  {
    name: 'Knowledge Sharer',
    description: 'Answer 10 doubts',
    icon: '💡',
    category: 'doubt',
    requirement: 10,
    requirementType: 'count',
    tier: 'bronze',
    points: 10,
    order: 21,
  },
  {
    name: 'Community Helper',
    description: 'Answer 50 doubts',
    icon: '🌟',
    category: 'doubt',
    requirement: 50,
    requirementType: 'count',
    tier: 'silver',
    points: 25,
    order: 22,
  },
  {
    name: 'Expert Mentor',
    description: 'Answer 100 doubts',
    icon: '🎓',
    category: 'doubt',
    requirement: 100,
    requirementType: 'count',
    tier: 'gold',
    points: 50,
    order: 23,
  },
  {
    name: 'Guru of Guidance',
    description: 'Answer 500 doubts',
    icon: '🧙',
    category: 'doubt',
    requirement: 500,
    requirementType: 'count',
    tier: 'platinum',
    points: 100,
    order: 24,
  },

  // ========================================
  // SPECIAL BADGES
  // ========================================
  {
    name: 'Early Bird',
    description: 'Join the platform as an early member',
    icon: '🐦',
    category: 'other',
    requirement: 1,
    requirementType: 'count',
    tier: 'gold',
    points: 50,
    order: 25,
  },
  {
    name: 'Night Owl',
    description: 'Study late at night consistently',
    icon: '🦉',
    category: 'other',
    requirement: 1,
    requirementType: 'count',
    tier: 'silver',
    points: 25,
    order: 26,
  },
  {
    name: 'Marathon Runner',
    description: 'Complete a 4+ hour study session',
    icon: '🏃',
    category: 'hours',
    requirement: 4,
    requirementType: 'hours',
    tier: 'silver',
    points: 25,
    order: 27,
  },
  {
    name: 'Perfect Week',
    description: 'Study every day for a week',
    icon: '🌈',
    category: 'streak',
    requirement: 7,
    requirementType: 'days',
    tier: 'silver',
    points: 25,
    order: 28,
  },
  {
    name: 'Top Performer',
    description: 'Reach top 10 in global rankings',
    icon: '🥇',
    category: 'other',
    requirement: 1,
    requirementType: 'count',
    tier: 'platinum',
    points: 100,
    order: 29,
  },
  {
    name: 'Group Leader',
    description: 'Create and manage a successful study group',
    icon: '👥',
    category: 'other',
    requirement: 1,
    requirementType: 'count',
    tier: 'gold',
    points: 50,
    order: 30,
  },
];

/**
 * Seed badges into database
 */
export const seedBadges = async (): Promise<void> => {
  try {
    LoggerUtil.info('🌱 Starting badge seeding...');

    // Connect to database
    await connectDB();

    // Clear existing badges
    const deletedCount = await Badge.deleteMany({});
    LoggerUtil.info(`🗑️  Cleared ${deletedCount.deletedCount} existing badges`);

    // Insert default badges
    const badges = await Badge.insertMany(defaultBadges);
    LoggerUtil.info(`✅ Seeded ${badges.length} badges successfully!`);

    // Log badge summary
    LoggerUtil.info('\n📊 Badge Summary:');
    LoggerUtil.info(`  - Bronze: ${badges.filter((b) => b.tier === 'bronze').length}`);
    LoggerUtil.info(`  - Silver: ${badges.filter((b) => b.tier === 'silver').length}`);
    LoggerUtil.info(`  - Gold: ${badges.filter((b) => b.tier === 'gold').length}`);
    LoggerUtil.info(`  - Platinum: ${badges.filter((b) => b.tier === 'platinum').length}`);
    LoggerUtil.info('\n🎯 Categories:');
    LoggerUtil.info(`  - Streak: ${badges.filter((b) => b.category === 'streak').length}`);
    LoggerUtil.info(`  - Hours: ${badges.filter((b) => b.category === 'hours').length}`);
    LoggerUtil.info(`  - Tasks: ${badges.filter((b) => b.category === 'task').length}`);
    LoggerUtil.info(`  - Goals: ${badges.filter((b) => b.category === 'goal').length}`);
    LoggerUtil.info(`  - Doubts: ${badges.filter((b) => b.category === 'doubt').length}`);
    LoggerUtil.info(`  - Other: ${badges.filter((b) => b.category === 'other').length}`);

    LoggerUtil.info('\n🎉 Badge seeding completed successfully!');
    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Badge seeding failed:', error.message);
    process.exit(1);
  }
};

/**
 * Run seeder if executed directly
 */
if (require.main === module) {
  seedBadges();
}

export default seedBadges;
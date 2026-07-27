/**
 * ====================================
 * CATEGORY SEEDER
 * ====================================
 * Seed predefined group categories and subjects
 * Note: Categories are defined in GroupCategory enum
 * This seeder provides reference data for frontend
 */

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

import { connectDB } from '@/database/connection';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * Categories with subjects and metadata
 */
const categories = [
  {
    name: 'JEE',
    displayName: 'JEE (Joint Entrance Examination)',
    description: 'Joint Entrance Examination preparation groups for IIT and NIT admissions',
    subjects: [
      'Physics',
      'Chemistry',
      'Mathematics',
      'Physical Chemistry',
      'Organic Chemistry',
      'Inorganic Chemistry',
      'Mechanics',
      'Electromagnetism',
      'Thermodynamics',
      'Waves and Optics',
      'Modern Physics',
      'Algebra',
      'Calculus',
      'Trigonometry',
      'Coordinate Geometry',
      'Vectors and 3D Geometry',
    ],
    icon: '📐',
    color: '#3B82F6',
    examDate: 'April-May',
    targetInstitutions: ['IIT', 'NIT', 'IIIT', 'GFTI'],
  },
  {
    name: 'NEET',
    displayName: 'NEET (National Eligibility cum Entrance Test)',
    description: 'Medical entrance examination preparation for MBBS and BDS admissions',
    subjects: [
      'Physics',
      'Chemistry',
      'Biology',
      'Zoology',
      'Botany',
      'Human Physiology',
      'Cell Biology',
      'Genetics',
      'Evolution',
      'Ecology',
      'Plant Physiology',
      'Biomolecules',
      'Biotechnology',
      'Organic Chemistry',
      'Inorganic Chemistry',
      'Physical Chemistry',
    ],
    icon: '🏥',
    color: '#10B981',
    examDate: 'May',
    targetInstitutions: ['AIIMS', 'JIPMER', 'Government Medical Colleges', 'Private Medical Colleges'],
  },
  {
    name: 'College',
    displayName: 'College Students',
    description: 'Study groups for college students across various subjects and courses',
    subjects: [
      'Computer Science',
      'Data Structures',
      'Algorithms',
      'Database Management Systems',
      'Operating Systems',
      'Computer Networks',
      'Software Engineering',
      'Machine Learning',
      'Artificial Intelligence',
      'Web Development',
      'Mobile Development',
      'Cloud Computing',
      'Cybersecurity',
      'Discrete Mathematics',
      'Linear Algebra',
      'Probability and Statistics',
      'Digital Electronics',
      'Microprocessors',
      'Theory of Computation',
      'Compiler Design',
    ],
    icon: '🎓',
    color: '#8B5CF6',
    targetDegrees: ['B.Tech', 'B.Sc', 'BCA', 'MCA', 'M.Tech', 'M.Sc'],
  },
  {
    name: 'Working Professional',
    displayName: 'Working Professionals',
    description: 'Professional skill development and upskilling groups for working individuals',
    subjects: [
      'Programming',
      'System Design',
      'Cloud Computing',
      'DevOps',
      'Data Science',
      'Business Analytics',
      'Project Management',
      'Leadership',
      'Product Management',
      'Digital Marketing',
      'Financial Analysis',
      'AWS Certification',
      'Azure Certification',
      'Google Cloud Certification',
      'Kubernetes',
      'Docker',
      'Microservices',
      'Blockchain',
      'Data Engineering',
      'UI/UX Design',
    ],
    icon: '💼',
    color: '#F59E0B',
    targetRoles: ['Software Engineer', 'Data Scientist', 'Product Manager', 'DevOps Engineer'],
  },
  {
    name: 'Language Learning',
    displayName: 'Language Learning',
    description: 'Language learning and practice groups for various languages',
    subjects: [
      'English',
      'Spanish',
      'French',
      'German',
      'Japanese',
      'Korean',
      'Mandarin Chinese',
      'Hindi',
      'Arabic',
      'Portuguese',
      'Russian',
      'Italian',
    ],
    icon: '🌍',
    color: '#EC4899',
    levels: ['Beginner', 'Intermediate', 'Advanced', 'Native'],
  },
  {
    name: 'Competitive Exams',
    displayName: 'Competitive Examinations',
    description: 'Preparation groups for various competitive examinations',
    subjects: [
      'UPSC Civil Services',
      'SSC CGL',
      'SSC CHSL',
      'Banking (IBPS PO/Clerk)',
      'Railways (RRB)',
      'State PSC',
      'CAT (MBA)',
      'GATE',
      'GRE',
      'GMAT',
      'IELTS',
      'TOEFL',
      'Current Affairs',
      'General Knowledge',
      'Quantitative Aptitude',
      'Reasoning',
      'English Comprehension',
    ],
    icon: '📚',
    color: '#EF4444',
    examBodies: ['UPSC', 'SSC', 'IBPS', 'RRB', 'State Government'],
  },
];

/**
 * Seed categories
 */
const seedCategories = async (): Promise<void> => {
  try {
    LoggerUtil.info('🌱 Starting category seeding...');
    LoggerUtil.info('');

    // Connect to database
    await connectDB();

    LoggerUtil.info('📋 AVAILABLE CATEGORIES:');
    LoggerUtil.info('='.repeat(60));

    categories.forEach((cat, index) => {
      LoggerUtil.info(`\n${index + 1}. ${cat.icon} ${cat.displayName}`);
      LoggerUtil.info(`   Description: ${cat.description}`);
      LoggerUtil.info(`   Subjects: ${cat.subjects.length} available`);
      LoggerUtil.info(`   Subjects: ${cat.subjects.slice(0, 5).join(', ')}${cat.subjects.length > 5 ? '...' : ''}`);
    });

    LoggerUtil.info('\n' + '='.repeat(60));
    LoggerUtil.info('\n📊 SUMMARY:');
    LoggerUtil.info(`   Total Categories: ${categories.length}`);
    LoggerUtil.info(`   Total Subjects: ${categories.reduce((sum, cat) => sum + cat.subjects.length, 0)}`);

    LoggerUtil.info('\n💡 USAGE NOTES:');
    LoggerUtil.info('   - Categories are defined in GroupCategory enum');
    LoggerUtil.info('   - These are reference data for frontend dropdown selection');
    LoggerUtil.info('   - No database insertion needed - data is static');
    LoggerUtil.info('   - Use this data in frontend for category selection');

    LoggerUtil.info('\n✅ Category seeding completed successfully!');
    LoggerUtil.info('💾 Category data is available for export');

    process.exit(0);
  } catch (error: any) {
    LoggerUtil.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
};

/**
 * Export categories as JSON
 */
const exportCategories = (): void => {
  const outputPath = path.join(process.cwd(), 'data', 'categories.json');
  const outputDir = path.dirname(outputPath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(categories, null, 2));

  LoggerUtil.info(`\n✅ Categories exported to: ${outputPath}`);
};

/**
 * Get categories data
 */
export const getCategoriesData = () => categories;

/**
 * Get category by name
 */
export const getCategoryByName = (name: string) => {
  return categories.find(cat => cat.name === name);
};

/**
 * Get all subjects
 */
export const getAllSubjects = () => {
  const allSubjects = new Set<string>();
  categories.forEach(cat => {
    cat.subjects.forEach(subject => allSubjects.add(subject));
  });
  return Array.from(allSubjects).sort();
};

/**
 * Main execution
 */
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'export') {
    exportCategories();
  } else {
    seedCategories();
  }
}

export default {
  seedCategories,
  exportCategories,
  getCategoriesData,
  getCategoryByName,
  getAllSubjects,
  categories,
};
/**
 * Company Categories and Metadata
 * Used for filtering mentors by company type
 */

export enum CompanyCategory {
  FAANG = 'FAANG',
  INDIAN_UNICORNS = 'INDIAN_UNICORNS',
  CONSULTING = 'CONSULTING',
  TOP_MNCS = 'TOP_MNCS',
  STARTUPS = 'STARTUPS',
  PRODUCT_BASED = 'PRODUCT_BASED',
  SERVICE_BASED = 'SERVICE_BASED',
}

export interface CompanyCategoryInfo {
  id: CompanyCategory;
  label: string;
  description: string;
  priority: number;
  examples?: string[];
}

export const COMPANY_CATEGORIES: Record<CompanyCategory, CompanyCategoryInfo> = {
  [CompanyCategory.FAANG]: {
    id: CompanyCategory.FAANG,
    label: 'FAANG',
    description: 'Top tech giants',
    priority: 1,
    examples: ['Facebook/Meta', 'Apple', 'Amazon', 'Netflix', 'Google'],
  },
  [CompanyCategory.INDIAN_UNICORNS]: {
    id: CompanyCategory.INDIAN_UNICORNS,
    label: 'Indian Unicorns',
    description: 'Fast-growing Indian startups valued at $1B+',
    priority: 2,
    examples: ['Flipkart', 'Ola', 'Paytm', 'Byju\'s', 'Swiggy'],
  },
  [CompanyCategory.CONSULTING]: {
    id: CompanyCategory.CONSULTING,
    label: 'Consulting Firms',
    description: 'Top consulting companies',
    priority: 3,
    examples: ['McKinsey', 'BCG', 'Bain', 'Deloitte', 'Accenture'],
  },
  [CompanyCategory.TOP_MNCS]: {
    id: CompanyCategory.TOP_MNCS,
    label: 'Top MNCs',
    description: 'Leading multinational corporations',
    priority: 4,
    examples: ['Microsoft', 'IBM', 'Oracle', 'SAP', 'Intel'],
  },
  [CompanyCategory.STARTUPS]: {
    id: CompanyCategory.STARTUPS,
    label: 'Startups',
    description: 'Early to mid-stage startups',
    priority: 5,
    examples: ['Series A', 'Series B', 'Series C companies'],
  },
  [CompanyCategory.PRODUCT_BASED]: {
    id: CompanyCategory.PRODUCT_BASED,
    label: 'Product Companies',
    description: 'Product development focused companies',
    priority: 6,
    examples: ['Adobe', 'Salesforce', 'Atlassian', 'Slack'],
  },
  [CompanyCategory.SERVICE_BASED]: {
    id: CompanyCategory.SERVICE_BASED,
    label: 'Service Companies',
    description: 'IT services and consulting',
    priority: 7,
    examples: ['TCS', 'Infosys', 'Wipro', 'HCL', 'Tech Mahindra'],
  },
};

/**
 * Get all company categories sorted by priority
 */
export const getCompanyCategories = (): CompanyCategoryInfo[] => {
  return Object.values(COMPANY_CATEGORIES).sort((a, b) => a.priority - b.priority);
};

/**
 * Get company category by ID
 */
export const getCompanyCategoryById = (
  id: CompanyCategory
): CompanyCategoryInfo | undefined => {
  return COMPANY_CATEGORIES[id];
};

/**
 * Check if a category exists
 */
export const isValidCompanyCategory = (category: string): category is CompanyCategory => {
  return Object.values(CompanyCategory).includes(category as CompanyCategory);
};

/**
 * Get category label
 */
export const getCategoryLabel = (category: CompanyCategory): string => {
  return COMPANY_CATEGORIES[category]?.label || category;
};

export default {
  CompanyCategory,
  COMPANY_CATEGORIES,
  getCompanyCategories,
  getCompanyCategoryById,
  isValidCompanyCategory,
  getCategoryLabel,
};
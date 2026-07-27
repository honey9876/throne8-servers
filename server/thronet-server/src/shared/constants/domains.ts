export enum Domain {
  WEB_DEVELOPMENT = 'web_development',
  MOBILE_DEVELOPMENT = 'mobile_development',
  DATA_SCIENCE = 'data_science',
  MACHINE_LEARNING = 'machine_learning',
  DEVOPS = 'devops',
  CLOUD_COMPUTING = 'cloud_computing',
  CYBERSECURITY = 'cybersecurity',
  BLOCKCHAIN = 'blockchain',
  UI_UX_DESIGN = 'ui_ux_design',
  PRODUCT_MANAGEMENT = 'product_management',
  DIGITAL_MARKETING = 'digital_marketing',
  BUSINESS_ANALYTICS = 'business_analytics',
  CAREER_GUIDANCE = 'career_guidance',
  INTERVIEW_PREP = 'interview_prep',
  LEADERSHIP = 'leadership',
}

interface DomainCategories {
  [key: string]: Domain[];
}

export const DOMAIN_CATEGORIES: DomainCategories = {
  'Engineering': [
    Domain.WEB_DEVELOPMENT,
    Domain.MOBILE_DEVELOPMENT,
    Domain.DEVOPS,
    Domain.CLOUD_COMPUTING,
    Domain.CYBERSECURITY,
    Domain.BLOCKCHAIN,
  ],
  'Data & AI': [
    Domain.DATA_SCIENCE,
    Domain.MACHINE_LEARNING,
    Domain.BUSINESS_ANALYTICS,
  ],
  'Design & Product': [
    Domain.UI_UX_DESIGN,
    Domain.PRODUCT_MANAGEMENT,
  ],
  'Business & Marketing': [
    Domain.DIGITAL_MARKETING,
    Domain.BUSINESS_ANALYTICS,
  ],
  'Career Development': [
    Domain.CAREER_GUIDANCE,
    Domain.INTERVIEW_PREP,
    Domain.LEADERSHIP,
  ],
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  [Domain.WEB_DEVELOPMENT]: 'Web Development',
  [Domain.MOBILE_DEVELOPMENT]: 'Mobile Development',
  [Domain.DATA_SCIENCE]: 'Data Science',
  [Domain.MACHINE_LEARNING]: 'Machine Learning',
  [Domain.DEVOPS]: 'DevOps',
  [Domain.CLOUD_COMPUTING]: 'Cloud Computing',
  [Domain.CYBERSECURITY]: 'Cybersecurity',
  [Domain.BLOCKCHAIN]: 'Blockchain',
  [Domain.UI_UX_DESIGN]: 'UI/UX Design',
  [Domain.PRODUCT_MANAGEMENT]: 'Product Management',
  [Domain.DIGITAL_MARKETING]: 'Digital Marketing',
  [Domain.BUSINESS_ANALYTICS]: 'Business Analytics',
  [Domain.CAREER_GUIDANCE]: 'Career Guidance',
  [Domain.INTERVIEW_PREP]: 'Interview Preparation',
  [Domain.LEADERSHIP]: 'Leadership & Management',
};

export const DOMAIN_SKILLS: Record<Domain, string[]> = {
  [Domain.WEB_DEVELOPMENT]: [
    'HTML', 'CSS', 'JavaScript', 'React', 'Angular', 'Vue.js',
    'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'REST API',
    'GraphQL', 'TypeScript', 'Next.js', 'Tailwind CSS',
  ],
  [Domain.MOBILE_DEVELOPMENT]: [
    'React Native', 'Flutter', 'iOS', 'Android', 'Swift',
    'Kotlin', 'Java', 'Dart', 'Firebase', 'Mobile UI/UX',
  ],
  [Domain.DATA_SCIENCE]: [
    'Python', 'R', 'SQL', 'Pandas', 'NumPy', 'Matplotlib',
    'Statistics', 'Data Visualization', 'Excel', 'Tableau',
  ],
  [Domain.MACHINE_LEARNING]: [
    'Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Keras',
    'Deep Learning', 'NLP', 'Computer Vision', 'MLOps',
  ],
  [Domain.DEVOPS]: [
    'Docker', 'Kubernetes', 'Jenkins', 'CI/CD', 'Git',
    'Linux', 'Bash', 'Terraform', 'Ansible', 'Monitoring',
  ],
  [Domain.CLOUD_COMPUTING]: [
    'AWS', 'Azure', 'GCP', 'Serverless', 'Lambda',
    'S3', 'EC2', 'CloudFormation', 'Infrastructure as Code',
  ],
  [Domain.CYBERSECURITY]: [
    'Network Security', 'Penetration Testing', 'Ethical Hacking',
    'Security Audits', 'SIEM', 'Firewall', 'Encryption',
  ],
  [Domain.BLOCKCHAIN]: [
    'Solidity', 'Ethereum', 'Smart Contracts', 'Web3',
    'Cryptocurrency', 'DeFi', 'NFT', 'Blockchain Architecture',
  ],
  [Domain.UI_UX_DESIGN]: [
    'Figma', 'Adobe XD', 'Sketch', 'User Research',
    'Wireframing', 'Prototyping', 'Design Systems', 'Usability Testing',
  ],
  [Domain.PRODUCT_MANAGEMENT]: [
    'Product Strategy', 'Roadmapping', 'User Stories',
    'Agile', 'Scrum', 'Analytics', 'A/B Testing', 'Market Research',
  ],
  [Domain.DIGITAL_MARKETING]: [
    'SEO', 'SEM', 'Google Analytics', 'Social Media Marketing',
    'Content Marketing', 'Email Marketing', 'PPC', 'Marketing Automation',
  ],
  [Domain.BUSINESS_ANALYTICS]: [
    'SQL', 'Excel', 'Power BI', 'Tableau', 'Data Analysis',
    'Business Intelligence', 'KPIs', 'Reporting',
  ],
  [Domain.CAREER_GUIDANCE]: [
    'Career Planning', 'Resume Building', 'Job Search Strategy',
    'Networking', 'Personal Branding', 'Career Transition',
  ],
  [Domain.INTERVIEW_PREP]: [
    'Technical Interviews', 'Behavioral Interviews', 'Coding Challenges',
    'System Design', 'Communication Skills', 'Mock Interviews',
  ],
  [Domain.LEADERSHIP]: [
    'Team Management', 'Conflict Resolution', 'Communication',
    'Decision Making', 'Strategic Thinking', 'Mentoring',
  ],
};

export const getDomainLabel = (domain: Domain): string => {
  return DOMAIN_LABELS[domain] || domain;
};

export const getDomainSkills = (domain: Domain): string[] => {
  return DOMAIN_SKILLS[domain] || [];
};

export const getCategoryDomains = (category: string): Domain[] => {
  return DOMAIN_CATEGORIES[category] || [];
};

export const isValidDomain = (domain: string): domain is Domain => {
  return Object.values(Domain).includes(domain as Domain);
};
export enum CompanySize {
  STARTUP = 'startup',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ENTERPRISE = 'enterprise',
}

export enum CompanyType {
  PRODUCT = 'product',
  SERVICE = 'service',
  CONSULTING = 'consulting',
  AGENCY = 'agency',
  STARTUP = 'startup',
}

export interface ICompany {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  industry: string;
  size: CompanySize;
  type: CompanyType;
  founded?: number;
  location: {
    city: string;
    state: string;
    country: string;
  };
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  techStack?: string[];
  employeeCount?: number;
  rating?: number;
  reviewCount?: number;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyProfile {
  company: ICompany;
  mentorCount: number;
  totalSessions: number;
  averageRating: number;
}
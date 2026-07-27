// // import ApiClient from '../utils/apiClient';
// // import config from '../config/env';
// // import { ICompany, CompanyProfile } from '@/interfaces/company.types';
// // import { ApiResponse } from '@/interfaces/common.types';
// // import logger from '../config/logger';

// import config from "@/config/env/env";
// import { ApiResponse } from "@/interfaces/mentorship/common.types";
// import { CompanyProfile, ICompany } from "@/interfaces/mentorship/company.types";
// import { logger } from "@/utils/logger.util";
// import ApiClient from "@/utils/mentorship/apiClient";

// class Company {
//   private client: ApiClient;
//   private cache: Map<string, { data: ICompany; timestamp: number }>;
//   private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

//   constructor() {
//     if (!config.COMPANY_SERVICE_URL) {
//       logger.warn('COMPANY_SERVICE_URL not configured. Company service integration disabled.');
//     }

//     this.client = new ApiClient(
//       {
//         baseURL: config.COMPANY_SERVICE_URL || 'http://localhost:4001',
//         timeout: 15000,
//       },
//       'Company Service'
//     );

//     this.cache = new Map();
//   }

//   async getCompanyById(companyId: string, authToken?: string): Promise<ICompany> {
//     try {
//       const cached = this.cache.get(companyId);
//       if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
//         logger.debug(`Cache hit for company: ${companyId}`);
//         return cached.data;
//       }

//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.get<ApiResponse<ICompany>>(
//         `/api/companies/${companyId}`
//       );

//       if (!response.success || !response.data) {
//         throw new Error('Company not found');
//       }

//       this.cache.set(companyId, {
//         data: response.data,
//         timestamp: Date.now(),
//       });

//       return response.data;
//     } catch(error : any) {
//       logger.error(`Failed to fetch company:$ {error}`);
//       throw error;
//     }
//   }

//   async getCompaniesByIds(companyIds: string[], authToken?: string): Promise<ICompany[]> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.post<ApiResponse<ICompany[]>>(
//         '/api/companies/bulk',
//         { companyIds }
//       );

//       if (!response.success || !response.data) {
//         throw new Error('Failed to fetch companies');
//       }

//       response.data.forEach((company) => {
//         this.cache.set(company._id, {
//           data: company,
//           timestamp: Date.now(),
//         });
//       });

//       return response.data;
//     } catch(error : any) {
//       logger.error(`Failed to fetch companies:${error}`);
//       throw error;
//     }
//   }

//   async getCompanyProfile(companyId: string, authToken?: string): Promise<CompanyProfile> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.get<ApiResponse<CompanyProfile>>(
//         `/api/companies/${companyId}/profile`
//       );

//       if (!response.success || !response.data) {
//         throw new Error('Company profile not found');
//       }

//       return response.data;
//     } catch(error : any) {
//       logger.error(`Failed to fetch company profile:$ {error}`);
//       throw error;
//     }
//   }

//   async verifyCompanyExists(companyId: string): Promise<boolean> {
//     try {
//       await this.getCompanyById(companyId);
//       return true;
//     } catch(error : any) {
//       return false;
//     }
//   }

//   async getCompanyBySlug(slug: string, authToken?: string): Promise<ICompany | null> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.get<ApiResponse<ICompany>>(
//         `/api/companies/slug/${slug}`
//       );

//       return response.success && response.data ? response.data : null;
//     } catch(error : any) {
//       logger.error(`Failed to fetch company by slug:${error}`);
//       return null;
//     }
//   }

//   async searchCompanies(
//     query: string,
//     filters?: Record<string, any>,
//     authToken?: string
//   ): Promise<ICompany[]> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.post<ApiResponse<ICompany[]>>(
//         '/api/companies/search',
//         { query, filters }
//       );

//       return response.success && response.data ? response.data : [];
//     } catch(error : any) {
//       logger.error(`Failed to search companies:${error}`);
//       return [];
//     }
//   }

//   async getAllCompanies(
//     page: number = 1,
//     limit: number = 20,
//     filters?: Record<string, any>,
//     authToken?: string
//   ): Promise<{ companies: ICompany[]; total: number }> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.get<ApiResponse<ICompany[]>>(
//         '/api/companies',
//         {
//           params: { page, limit, ...filters },
//         }
//       );

//       if (!response.success) {
//         throw new Error('Failed to fetch companies');
//       }

//       return {
//         companies: response.data || [],
//         total: response.meta?.total || 0,
//       };
//     } catch(error : any) {
//       logger.error(`Failed to fetch all companies:$ {error}`);
//       return { companies: [], total: 0 };
//     }
//   }

//   async getTopCompanies(limit: number = 10, authToken?: string): Promise<ICompany[]> {
//     try {
//       if (authToken) {
//         this.client.setAuthToken(authToken);
//       }

//       const response = await this.client.get<ApiResponse<ICompany[]>>(
//         '/api/companies/top',
//         {
//           params: { limit },
//         }
//       );

//       return response.success && response.data ? response.data : [];
//     } catch(error : any) {
//       logger.error(`Failed to fetch top companies:$ {error}`);
//       return [];
//     }
//   }

//   clearCache(companyId?: string): void {
//     if (companyId) {
//       this.cache.delete(companyId);
//       logger.debug(`Cleared cache for company: ${companyId}`);
//     } else {
//       this.cache.clear();
//       logger.debug('Cleared all company cache');
//     }
//   }

//   clearExpiredCache(): void {
//     const now = Date.now();
//     let cleared = 0;

//     this.cache.forEach((value, key) => {
//       if (now - value.timestamp >= this.CACHE_TTL) {
//         this.cache.delete(key);
//         cleared++;
//       }
//     });

//     if (cleared > 0) {
//       logger.debug(`Cleared ${cleared} expired cache entries`);
//     }
//   }
// }

// export default new Company();
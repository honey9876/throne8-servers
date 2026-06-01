// /**
//  * ====================================
//  * API TYPES
//  * ====================================
//  * Request/Response type definitions
//  */

// import { Request } from 'express';
// import { PaginationMeta, PaginationParams } from './common.types';

// /**
//  * API Request with typed body
//  */
// export interface ApiRequest<T = any> extends Request {
//   body: T;
//   params: any;
//   query: any;
//   user?: any;
//   userId?: string;
// }

// /**
//  * API Response structure
//  */
// export interface ApiResponse<T = any> {
//   success: boolean;
//   message: string;
//   data?: T;
//   error?: string;
//   errors?: any[];
//   statusCode?: number;
//   timestamp?: string;
// }

// /**
//  * Paginated API Response
//  */
// export interface PaginatedResponse<T> {
//   success: boolean;
//   message: string;
//   data: T[];
//   meta: PaginationMeta;
//   timestamp?: string;
// }

// /**
//  * Query parameters with pagination
//  */
// export interface QueryWithPagination extends PaginationParams {
//   search?: string;
//   filter?: Record<string, any>;
//   sortBy?: string;
//   sortOrder?: 'asc' | 'desc';
// }

// /**
//  * Bulk operation result
//  */
// export interface BulkOperationResult {
//   success: boolean;
//   inserted: number;
//   updated: number;
//   deleted: number;
//   failed: number;
//   errors?: any[];
// }

// /**
//  * File upload request
//  */
// export interface FileUploadRequest extends ApiRequest {
//   file?: Express.Multer.File;
//   files?: Express.Multer.File[];
// }

// /**
//  * Auth request (with authenticated user)
//  */
// export interface AuthRequest<T = any> extends ApiRequest<T> {
//   user: any; // From auth middleware
//   userId: string;
// }
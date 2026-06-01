// /**
//  * ====================================
//  * USER TYPES
//  * ====================================
//  * Type definitions for User-related operations
//  */

// import { UserRole } from '../enums/UserRole.enum';

// /**
//  * User Registration Data
//  */
// export interface RegisterUserData {
//   name: string;
//   email: string;
//   password: string;
//   role?: UserRole;
//   phone?: string;
// }

// /**
//  * User Login Data
//  */
// export interface LoginUserData {
//   email: string;
//   password: string;
// }

// /**
//  * User Response (without password)
//  */
// export interface UserResponse {
//   _id: string;
//   name: string;
//   email: string;
//   role: UserRole;
//   avatar?: string;
//   phone?: string;
//   bio?: string;
//   isEmailVerified: boolean;
//   isActive: boolean;
//   lastActive: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// /**
//  * Auth Response with Tokens
//  */
// export interface AuthResponse {
//   user: UserResponse;
//   accessToken: string;
//   refreshToken: string;
// }

// /**
//  * Update Profile Data
//  */
// export interface UpdateProfileData {
//   name?: string;
//   phone?: string;
//   bio?: string;
//   avatar?: string;
// }

// /**
//  * Change Password Data
//  */
// export interface ChangePasswordData {
//   currentPassword: string;
//   newPassword: string;
// }

// /**
//  * JWT Payload
//  */
// export interface JWTPayload {
//   userId: string;
//   email: string;
//   role: UserRole;
// }
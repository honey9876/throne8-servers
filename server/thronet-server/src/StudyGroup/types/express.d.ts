// /**
//  * ====================================
//  * EXPRESS TYPE EXTENSIONS
//  * ====================================
//  * Extend Express Request interface
//  */

// import { Request } from 'express';
// import { IUser } from '../interfaces/IUser';

// declare global {
//   namespace Express {
//     interface Request {
//       user?: IUser;
//       userId?: string;
//     }
//   }
// }

// export interface AuthRequest extends Request {
//   user?: IUser;
//   userId?: string;
// }
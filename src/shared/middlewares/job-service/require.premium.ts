// // import { AppError, AuthorizationError } from '@/errors/app.error.js';
// // import * as premium from '@/services/job-service/services/premium/premium.service.js';
// // import logger from '@/utils/logger.util.js';

// import { AuthorizationError, errorHandler } from "@/errors/app.error";
// import { logger } from "@/utils/logger.util";
// import ResponseUtil from "@/utils/response.util";

// export const requirePremium = async (req, res, next) => {
//   try {
//     const hasAccess = await hasPremiumAccess(req.user);
//     if (!hasAccess) {
//       throw new AuthorizationError('Premium membership required to access this feature');
      
//     }
//     next();
//   } catch (err: any) {
//     logger.error(`requirePremium middleware failed: ${err.message}`, { userId: req.user.id });
//     return res.status(err.statusCode || 500).json(
//         new errorHandler(err.message || 'Internal Server Error')
//         );
//   }
// };

// // export const createValidationMiddleware = () => [
// //   body('q').optional().isLength({ max: 200 }).trim().escape(),
// //   body('location').optional().isLength({ max: 100 }).trim().escape(),
// //   body('company').optional().isLength({ max: 100 }).trim().escape(),
// //   body('title').optional().isLength({ max: 100 }).trim().escape(),
// //   body('skills').optional().isArray({ max: 20 }),
// //   body('industries').optional().isArray({ max: 10 }),
// //   body('page').optional().isInt({ min: 1, max: 1000 }),
// //   body('limit').optional().isInt({ min: 1, max: 100 }),
// //   body('salaryMin').optional().isFloat({ min: 0, max: 1000000 }),
// //   body('salaryMax').optional().isFloat({ min: 0, max: 2000000 })
// // ];

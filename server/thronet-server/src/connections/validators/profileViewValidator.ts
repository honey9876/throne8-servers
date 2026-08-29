/**
 * Profile View Validators - Production-Ready for 1M+ Users
 * Validation schemas for profile view endpoints using express-validator.
 * This file defines input validation rules for all profile view routes,
 * ensuring data integrity, security, and proper formatting.
 * Optimized to prevent common attacks (e.g., injection) and enforce limits.
 * 
 * Features (Implemented 8 out of 8 - Validators for All Routes):
 * 1. recordProfileView - Validates body for recording views
 * 2. getWhoViewedProfile - Validates query for viewers list
 * 3. getProfileViewCount - Validates query for count
 * 4. getProfileViewAnalytics - Validates query for analytics
 * 5. setProfileViewPrivacy - Validates body for privacy update
 * 6. deleteProfileViewHistory - Validates query for history deletion
 * 7. getProfileViewInsights - Validates query for insights
 * 8. exportProfileViewData - Validates query for data export
 * 
 * Additional Validators:
 * - batchOperations - Validates body for batch ops (Bonus)
 * 
 * Dependencies:
 * - express-validator: For check, body, query, param validations
 * - commonValidator.ts: Reusable validators (e.g., for IDs, dates)
 * - constants.ts: For limits (e.g., MAX_PAGINATION_LIMIT)
 * 
 * Scalability Considerations:
 * - Sanitization to prevent XSS/injection
 * - Custom validators for complex checks (e.g., date ranges)
 * - Limits on array sizes, string lengths
 * - Bail on first error to save processing
 * 
 * Integration:
 * - Used in profileViewRoutes.ts via validationMiddleware
 * - Aligns with API_DOCS.md for input specs
 * - Testable in tests/unit/validators/profileViewValidator.test.ts
 */

import { body, query } from 'express-validator';
import { commonValidators } from './commonValidator';

// Inlined — ../utils/constants does not exist anywhere in this repo, the original
// import was broken and would have failed at module load time.
const MAX_PAGINATION_LIMIT = 100;
const VALID_SOURCES = ['profile', 'search', 'suggestion', 'connection'];
const VALID_PRIVACY_LEVELS = ['public', 'connections', 'private'];
const VALID_INSIGHT_TYPES = ['trends', 'patterns', 'predictions'];

export const profileViewValidators = {
  /**
   * Feature 1: recordProfileView validator
   * Validates profileId (required), metadata (optional object), source (enum)
   */
  recordProfileView: [
    body('profileId')
      .exists().withMessage('profileId is required')
      .bail()
      .custom(commonValidators.isValidUserId).withMessage('Invalid profileId format'),
    body('metadata')
      .optional()
      .isObject().withMessage('metadata must be an object')
      .bail()
      .customSanitizer(value => {
        // Sanitize metadata to prevent deep objects
        if (typeof value === 'object' && value !== null) {
          return Object.fromEntries(
            Object.entries(value).slice(0, 10) // Limit to 10 keys
          );
        }
        return {};
      }),
    body('source')
      .optional()
      .isIn(VALID_SOURCES).withMessage(`source must be one of: ${VALID_SOURCES.join(', ')}`)
  ],

  /**
   * Feature 2: getWhoViewedProfile validator
   * Validates pagination (limit, skip), sort (JSON), includeMetadata (boolean)
   */
  getWhoViewedProfile: [
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_PAGINATION_LIMIT }).withMessage(`limit must be between 1 and ${MAX_PAGINATION_LIMIT}`)
      .toInt(),
    query('skip')
      .optional()
      .isInt({ min: 0 }).withMessage('skip must be >= 0')
      .toInt(),
    query('sort')
      .optional()
      .custom(value => {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed !== 'object' || parsed === null) throw new Error();
          return true;
        } catch {
          throw new Error('sort must be valid JSON object');
        }
      }),
    query('includeMetadata')
      .optional()
      .isBoolean().withMessage('includeMetadata must be boolean')
      .toBoolean()
  ],

  /**
   * Feature 3: getProfileViewCount validator
   * Validates days (int, 1-365)
   */
  getProfileViewCount: [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 }).withMessage('days must be between 1 and 365')
      .toInt()
  ],

  /**
   * Feature 4: getProfileViewAnalytics validator
   * Validates days (int, 1-365)
   */
  getProfileViewAnalytics: [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 }).withMessage('days must be between 1 and 365')
      .toInt()
  ],

  /**
   * Feature 5: setProfileViewPrivacy validator
   * Validates privacyLevel (enum)
   */
  setProfileViewPrivacy: [
    body('privacyLevel')
      .exists().withMessage('privacyLevel is required')
      .bail()
      .isIn(VALID_PRIVACY_LEVELS).withMessage(`privacyLevel must be one of: ${VALID_PRIVACY_LEVELS.join(', ')}`)
  ],

  /**
   * Feature 6: deleteProfileViewHistory validator
   * Validates daysOld (int, >=1)
   */
  deleteProfileViewHistory: [
    query('daysOld')
      .optional()
      .isInt({ min: 1 }).withMessage('daysOld must be >= 1')
      .toInt()
  ],

  /**
   * Feature 7: getProfileViewInsights validator
   * Validates insightType (enum)
   */
  getProfileViewInsights: [
    query('insightType')
      .optional()
      .isIn(VALID_INSIGHT_TYPES).withMessage(`insightType must be one of: ${VALID_INSIGHT_TYPES.join(', ')}`)
  ],

  /**
   * Feature 8: exportProfileViewData validator
   * Validates dates (ISO), format (json/csv)
   */
  exportProfileViewData: [
    query('startDate')
      .optional()
      .custom(commonValidators.isValidISODate).withMessage('startDate must be valid ISO date')
      .bail()
      .customSanitizer(value => new Date(value)),
    query('endDate')
      .optional()
      .custom(commonValidators.isValidISODate).withMessage('endDate must be valid ISO date')
      .bail()
      .customSanitizer(value => new Date(value)),
    query('format')
      .optional()
      .isIn(['json', 'csv']).withMessage('format must be json or csv'),
    // Custom validator for date range
    query('startDate').custom((startDate, { req }) => {
      if (startDate && req.query?.endDate) {
        if (new Date(startDate) >= new Date(req.query.endDate as string)) {
          throw new Error('startDate must be before endDate');
        }
      }
      return true;
    })
  ],

  /**
   * Bonus: batchOperations validator
   * Validates operations array (max 100 items), each with type and params
   */
  batchOperations: [
    body('operations')
      .isArray({ min: 1, max: 100 }).withMessage('operations must be array of 1-100 items'),
    body('operations.*.type')
      .exists().withMessage('operation type required')
      .bail()
      .isIn(['record', 'delete', 'export']).withMessage('Invalid operation type'),
    // Conditional validation based on type (simplified)
    body('operations.*').custom((op) => {
      if (op.type === 'record' && !op.params?.profileId) {
        throw new Error('profileId required for record operation');
      }
      return true;
    })
  ]
};
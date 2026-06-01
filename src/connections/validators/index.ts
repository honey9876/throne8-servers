// src/validators/index.ts

// Core Validators
// export * from './connectionValidator';
export * from './requestValidator';
export * from './followValidator';
// export * from './searchValidator';
// export * from './privacyValidator';
export * from './commonValidator';

// Re-export commonly used validators
export {
  validateFollowUser,
  validateBulkFollow,
  validateBulkUnfollow,
  validateListQuery,
  validateAuthenticatedUser,
  sanitizeInput,
  validateRequestSize,
  validateObjectIdParam
} from './followValidator';

// src/validators/index.ts

// export * from './connectionValidator';
export * from './requestValidator';
// export * from './searchValidator';
export * from './followValidator';
// export * from './privacyValidator';
export * from './commonValidator';
export * from './noteValidator'; // ADD THIS LINE
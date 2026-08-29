// src/connections/types/express.d.ts

/**
 * Custom type definition for Express Request.user
 *
 * ⚠️ IMPORTANT: We augment `Express.User` (the interface Passport itself
 * declares and already wires up as `Request.user?: User`), NOT
 * `Request.user` directly. Declaring `Request.user` in more than one place
 * (or via more than one merging path — `express-serve-static-core` module
 * augmentation vs `declare global namespace Express`) requires every
 * declaration to have the byte-for-byte same shape, or TS throws
 * "Subsequent property declarations must have the same type".
 *
 * Augmenting `Express.User` avoids that entirely — there's only ONE
 * declaration of `Request.user` in the whole type chain (Passport's), and
 * we just add fields to what `User` means.
 *
 * ✅ Because of this, do NOT add any other `declare global { namespace
 * Express { interface Request { user?: ... } } }` block anywhere else in
 * the project (e.g. inside individual middleware files) — extend this
 * interface here instead.
 */
declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string;
      isAdmin?: boolean;
      region?: string;
      role: 'user' | 'admin';
      [key: string]: any;
    }
  }
}

export {};
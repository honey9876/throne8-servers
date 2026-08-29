// src/shared/types/express/index.d.ts
//
// ⚠️ THIS IS THE ONLY FILE IN THE ENTIRE PROJECT THAT SHOULD DECLARE
// `Express.User` / `Request.user` / `Request.correlationId`.
//
// Why: TypeScript merges ALL `declare global { namespace Express {...} } }`
// blocks across the whole codebase into one global type. If two files
// declare `Request.user` with even slightly different shapes, TS throws
// "Subsequent property declarations must have the same type" — which is
// exactly what was happening (company/interfaces/express.d.ts,
// Mentorship/interface/express.d.ts, connections/types/express.d.ts, and
// rbca.middleware.ts were ALL declaring it differently).
//
// This shape is copied EXACTLY from `ReqUser` in
// `shared/middlewares/auth.middleware.ts` — the one place that actually
// does `req.user = {...}` at runtime. That file is the source of truth;
// this file just mirrors it for the type system.
//
// If you ever change what auth.middleware.ts attaches to req.user, update
// this file to match — and ONLY this file.

export {};

declare global {
  namespace Express {
    interface User {
      id: string;
      userId: string;
      _id: string;
      isAdmin: boolean;
      region?: string;
      role: 'user' | 'admin';
      email: string;
      deviceId: string | null;
      sessionId: string | null;
    }

    interface Request {
      correlationId?: string;
    }
  }
}
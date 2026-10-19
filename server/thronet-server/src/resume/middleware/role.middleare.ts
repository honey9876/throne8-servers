import { Response, NextFunction } from "express";

import { AuthRequest } from "./auth.middleware";
import { ApiError } from "../utils/ApiError";
import { UserRole } from "../models/user.model";

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Unauthorized"));
    }

    if (!allowedRoles.includes(req.user.role as any)) {
      return next(new ApiError(403, "Forbidden - Insufficient permissions"));
    }

    next();
  };
};

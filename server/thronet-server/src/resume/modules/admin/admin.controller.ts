import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";

import { getDashboardStats, getUsers, updateUserStatus } from "./admin.service";

import { getUserDetails } from "./admin.service";

export const dashboardStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const stats = await getDashboardStats();

    res.status(200).json({
      success: true,
      stats,
    });
  },
);

import { AuthRequest } from "../../middleware/auth.middleware";

export const usersList = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 10;

    const search = String(req.query.search || "");

    const result = await getUsers(page, limit, search);

    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

export const changeStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    console.log("BODY", req.body);

    const user = await updateUserStatus(
      req.params.id as string,
      req.body.status,
    );

    console.log("UPDATED USER", user);

    res.status(200).json({
      success: true,
      user,
    });
  },
);

import { deleteUser } from "./admin.service";
import { ApiError } from "../../utils/ApiError";

export const removeUser = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    await deleteUser(req.params.id as string);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  },
);

export const userDetails = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const result = await getUserDetails(req.params.id as string);

    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

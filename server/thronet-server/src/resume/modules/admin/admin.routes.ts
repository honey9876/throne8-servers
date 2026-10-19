import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";
import { adminOnly } from "../../middleware/admin.middleware";

 

import {
    changeStatus,
  dashboardStats,
  removeUser,
  userDetails,
  usersList,
} from "./admin.controller";

const router = Router();

router.use(
  protect,
  adminOnly
);

router.get(
  "/dashboard",
  dashboardStats
);


router.get(
  "/users",
  usersList
);

router.patch(
  "/users/:id/status",
  changeStatus
);

router.delete(
  "/users/:id",
  removeUser
);

router.get(
  "/users/:id",
  userDetails
);
export default router;
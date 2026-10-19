import { authorize } from "./role.middleare";
export const adminOnly = authorize("admin");

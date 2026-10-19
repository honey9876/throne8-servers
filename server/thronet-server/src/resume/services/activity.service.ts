import {
  Activity,
  ActivityType,
} from "../models/activity.model";

export async function logActivity(
  userId: string,
  type: ActivityType,
  message: string
) {
  await Activity.create({
    userId,
    type,
    message,
  });
}
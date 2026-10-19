import { Request } from "express";

export interface CreateNotificationInput {
  userId: string;
  type: "booking_confirmed" | "booking_cancelled" | "booking_completed" | "generic";
  title: string;
  message: string;
  link?: string;
}

export interface GetNotificationsQuery {
  limit?: number;
}

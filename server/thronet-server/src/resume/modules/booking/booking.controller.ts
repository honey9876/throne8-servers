import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import * as bookingService from "./booking.service";

export const createBooking = async (req: AuthRequest, res: Response) => {
  const booking = await bookingService.createBooking({
    ...req.body,
    userId: req.userId!,
  });

  res.status(201).json({
    success: true,
    data: booking,
  });
};

export const getMyHistory = async (req: AuthRequest, res: Response) => {
  const bookings = await bookingService.getMyBookings(req.userId!);
  
  res.json({
    success: true,
    data: bookings,
  });
};

export const getAllBookings = async (req: Request, res: Response) => {
  const bookings = await bookingService.getAllBookings();
  
  res.json({
    success: true,
    data: bookings,
  });
};

export const confirmBooking = async (req: AuthRequest, res: Response) => {
  const booking = await bookingService.confirmBooking(req.params.id as string, req.body);
  
  res.json({
    success: true,
    data: booking,
  });
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  const booking = await bookingService.cancelBooking(req.params.id as string, req.body);
  
  res.json({
    success: true,
    data: booking,
  });
};

export const completeBooking = async (req: AuthRequest, res: Response) => {
  const booking = await bookingService.completeBooking(
    req.params.id as string,
    req.userId!,
    req.body
  );
  
  res.json({
    success: true,
    data: booking,
  });
};

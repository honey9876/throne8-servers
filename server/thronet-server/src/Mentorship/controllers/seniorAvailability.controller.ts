import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import seniorAvailabilityService from '../services/seniorAvailability.service';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

class SeniorAvailabilityController {
  
  async getAvailabilityConfig(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.user!.id; 
      const config = await seniorAvailabilityService.getConfig(mentorId);
      
      if (!config) {
        return ResponseHandler.error(res, 'Senior mentor availability config not found', 404);
      }

      return ResponseHandler.success(res, 'Senior mentor availability config retrieved successfully', config);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  async updateAvailabilityConfig(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.user!.id; 
      const config = await seniorAvailabilityService.upsertConfig(mentorId, req.body);

      return ResponseHandler.success(res, 'Senior mentor availability config updated successfully', config);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  async getAvailableSlots(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.query.mentorId ? req.query.mentorId.toString() : req.user!.id;
      const date = req.query.date as string;
      const duration = parseInt(req.query.duration as string, 10);

      const slots = await seniorAvailabilityService.getAvailableSlots(mentorId, date, duration);

      return ResponseHandler.success(res, 'Available slots retrieved successfully', slots);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  async getMonthlyAvailability(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.query.mentorId ? req.query.mentorId.toString() : req.user!.id;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const duration = parseInt(req.query.duration as string, 10) || 60; // Default 60 mins for simple day availability checks

      const monthlySlots = await seniorAvailabilityService.getMonthlyAvailability(mentorId, startDate, endDate, duration);

      return ResponseHandler.success(res, 'Monthly availability retrieved successfully', monthlySlots);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  async addBlockedTime(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.user!.id;
      const { date, startTime, endTime, reason } = req.body;
      
      const config = await seniorAvailabilityService.addBlockedTime(mentorId, date, startTime, endTime, reason);

      return ResponseHandler.success(res, 'Blocked time added successfully', config, 201);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  async removeBlockedTime(req: AuthRequest, res: Response) {
    try {
      const mentorId = req.user!.id;
      const blockedTimeId = req.params.id;
      
      const config = await seniorAvailabilityService.removeBlockedTime(mentorId, blockedTimeId);

      return ResponseHandler.success(res, 'Blocked time removed successfully', config);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }
}

export default new SeniorAvailabilityController();

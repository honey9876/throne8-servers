import { Request, Response, NextFunction } from 'express';
import payoutService from '../services/payout.service';
import mentorRepository from '../repositories/mentor.repository';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { BadRequestError } from '@/shared/errors/app.error';

export async function adminList(req: Request, res: Response, next: NextFunction) {
  try {
    const status = ['held', 'released', 'paid', 'approved'].includes(String(req.query.status))
      ? String(req.query.status)
      : 'held';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { data, total } = await payoutService.listForAdmin(status, page, limit);
    ResponseHandler.paginated(res, 'Payouts retrieved successfully', data, page, limit, total);
  } catch (error) {
    next(error);
  }
}

export async function adminRelease(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await payoutService.release(req.params.paymentId, req.user?.userId || '');
    ResponseHandler.success(res, 'Payout released', payment);
  } catch (error) {
    next(error);
  }
}

export async function adminMarkPaid(req: Request, res: Response, next: NextFunction) {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    if (reference.length < 3) throw new BadRequestError('Payout reference (UTR / transaction id) is required');
    const payment = await payoutService.markPaid(req.params.paymentId, req.user?.userId || '', reference);
    ResponseHandler.success(res, 'Payout marked as paid', payment);
  } catch (error) {
    next(error);
  }
}

export async function mentorOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const mentor: any = await mentorRepository.findByMentorId(req.params.mentorId);
    if (!mentor) {
      ResponseHandler.notFound(res, 'Mentor not found');
      return;
    }
    if (mentor.userId !== req.user?.userId) {
      ResponseHandler.forbidden(res, 'You can only view your own earnings');
      return;
    }
    const overview = await payoutService.mentorOverview(req.params.mentorId);
    ResponseHandler.success(res, 'Earnings retrieved', overview);
  } catch (error) {
    next(error);
  }
}
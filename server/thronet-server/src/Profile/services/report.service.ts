import Report, { ReportReason } from '../models/Report.model';
import { LoggerUtil } from '@/shared/logger.util';

interface CreateReportInput {
    postId: string;
    reporterId: string;
    reason: ReportReason;
    details?: string;
    postOwnerId?: string;
}

class ReportService {
    /**
     * ✅ CREATE REPORT — ek user ek post ko sirf ek baar report kar sakta hai
     */
    static async createReport(input: CreateReportInput) {
        const { postId, reporterId, reason, details, postOwnerId } = input;

        const alreadyReported = await Report.hasAlreadyReported(postId, reporterId);
        if (alreadyReported) {
            throw new Error('You have already reported this post');
        }

        const report = await Report.create({
            postId,
            reporterId,
            reason,
            details,
            postOwnerId,
            status: 'pending',
        });

        LoggerUtil.info('Report created', {
            reportId: report.reportId,
            postId,
            reporterId,
            reason,
        });

        return report;
    }

    /**
     * ✅ GET REPORTS FOR A POST (moderation/admin use)
     */
    static async getReportsByPost(postId: string) {
        return await Report.findByPostId(postId);
    }

    /**
     * ✅ GET REPORTS SUBMITTED BY A USER
     */
    static async getReportsByReporter(reporterId: string) {
        return await Report.findByReporter(reporterId);
    }

    /**
     * ✅ GET ALL PENDING REPORTS (admin/moderation queue)
     */
    static async getPendingReports(limit = 50) {
        return await Report.getPendingReports(limit);
    }

    /**
     * ✅ UPDATE REPORT STATUS (admin/moderation action)
     */
    static async updateReportStatus(
        reportId: string,
        status: 'reviewed' | 'action_taken' | 'dismissed',
        reviewedBy: string
    ) {
        const report = await Report.findOne({ reportId });
        if (!report) {
            throw new Error('Report not found');
        }

        report.status = status;
        report.reviewedBy = reviewedBy;
        report.reviewedAt = new Date();
        await report.save();

        LoggerUtil.info('Report status updated', { reportId, status, reviewedBy });

        return report;
    }
}

export default ReportService;
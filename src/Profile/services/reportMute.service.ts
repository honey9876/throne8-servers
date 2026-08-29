import { v4 as uuidv4 } from 'uuid';
import { Comment } from '@/shared/models/index.models';
import CommentReport from '@/Profile/models/CommentReport.model';
import MutedThread from '@/Profile/models/MutedThread.model';
import { LoggerUtil } from '@/shared/logger.util';

class ReportMuteService {
    /**
     * ✅ Report a comment. Idempotent-ish — dobara report karne pe error throw
     * karta hai taaki spam-reporting na ho sake.
     */
    static async reportComment(commentId: string, reportedBy: string, reason?: string) {
        const comment = await Comment.findOne({ commentId, isDeleted: false });
        if (!comment) throw new Error('Comment not found');

        if (comment.userId === reportedBy) {
            throw new Error('You cannot report your own comment');
        }

        const already = await CommentReport.hasAlreadyReported(commentId, reportedBy);
        if (already) {
            throw new Error('You have already reported this comment');
        }

        const report = new CommentReport({
            reportId: uuidv4(),
            commentId,
            postId: comment.postId,
            reportedBy,
            commentAuthorId: comment.userId,
            reason: reason || 'not_specified',
        });
        await report.save();

        LoggerUtil.info('Comment reported', { commentId, reportedBy, reason });

        return { reportId: report.reportId, commentId, message: 'Comment reported successfully' };
    }

    /**
     * ✅ Mute a thread (post) — user ko us post ke naye comments/likes ki
     * notifications aana band ho jaayengi. commentId se postId derive hota hai.
     */
    static async muteThread(commentId: string, userId: string) {
        const comment = await Comment.findOne({ commentId, isDeleted: false });
        if (!comment) throw new Error('Comment not found');

        const already = await MutedThread.isMuted(userId, comment.postId);
        if (already) {
            return { postId: comment.postId, message: 'Thread already muted' };
        }

        const mute = new MutedThread({
            muteId: uuidv4(),
            userId,
            postId: comment.postId,
        });
        await mute.save();

        LoggerUtil.info('Thread muted', { userId, postId: comment.postId });

        return { postId: comment.postId, message: 'Thread muted successfully' };
    }

    static async unmuteThread(postId: string, userId: string) {
        await MutedThread.deleteOne({ userId, postId });
        return { postId, message: 'Thread unmuted successfully' };
    }

    static async getMutedThreads(userId: string) {
        const muted = await MutedThread.find({ userId }).sort({ mutedAt: -1 }).lean();
        return muted.map((m: any) => m.postId);
    }
}

export default ReportMuteService;
// src/socket/handlers/mentorshipHandler.ts

import { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../types';
import { emitToUser } from '../emitter';
import { SessionMentor, Mentor, SeniorSession } from '@/Mentorship/models';
import notificationService, {
  NotificationType,
  NotificationChannel,
} from '@/Mentorship/services/notification.service';
import { LoggerUtil } from '@/shared/logger.util';

interface ResolvedSession {
  title?: string;
  mentorUserId?: string;
  menteeUserId?: string;
  bookingIdStr?: string;
  isSenior: boolean;
}

async function resolveMentorshipSession(sessionId: string): Promise<ResolvedSession | null> {
  const session = await SessionMentor.findOne({ sessionId });
  if (session) {
    const mentor = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
    const confirmedBooking = session.bookings?.find((b: any) =>
      ['confirmed', 'in_progress', 'rescheduled'].includes(b.status)
    );
    return {
      title: session.title,
      mentorUserId: mentor?.userId,
      menteeUserId: session.menteeId || confirmedBooking?.menteeId || confirmedBooking?.bookedBy,
      bookingIdStr: (confirmedBooking as any)?._id?.toString() || '',
      isSenior: false,
    };
  }

  const seniorSession = await SeniorSession.findOne({ sessionId });
  if (seniorSession) {
    const activeBooking = seniorSession.bookings?.find((b: any) =>
      ['confirmed', 'upcoming', 'in_progress'].includes(b.status)
    );
    return {
      title: seniorSession.title,
      mentorUserId: seniorSession.mentorId,
      menteeUserId: activeBooking?.menteeId || activeBooking?.bookedBy,
      bookingIdStr: (activeBooking as any)?._id?.toString() || '',
      isSenior: true,
    };
  }

  return null;
}

export const setupMentorshipHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const userId = socket.data.userId;
  if (!userId) return;

  socket.on('mentorship:notify-join', async (data: { sessionId: string; bookingId?: string }) => {
    try {
      const { sessionId } = data;
      if (!sessionId) return;

      const sessionInfo = await resolveMentorshipSession(sessionId);
      if (!sessionInfo) {
        LoggerUtil.warn('mentorship:notify-join — session not found', { sessionId });
        return;
      }

      const { mentorUserId, menteeUserId, title } = sessionInfo;
      // payload ka bookingId pehle (ek session par multiple bookings ho sakti hain)
      const bookingIdStr = data.bookingId || sessionInfo.bookingIdStr;

      // Mentee room me aaya: pehli baar join record karo (cron completed vs no_show isi se tay karta hai)
      if (userId !== mentorUserId) {
        await SessionMentor.updateOne(
          {
            sessionId,
            bookings: {
              $elemMatch: {
                $or: [{ menteeId: userId }, { bookedBy: userId }],
                status: 'in_progress',
                menteeJoinedAt: { $exists: false },
              },
            },
          } as any,
          { $set: { 'bookings.$.menteeJoinedAt': new Date() } }
        ).catch((e: any) => LoggerUtil.warn('menteeJoinedAt save failed', { error: e.message }));
      }
      let targetUserId: string | undefined;
      let joinerRole: 'mentor' | 'mentee' = 'mentee';

      if (userId === mentorUserId) {
        targetUserId = menteeUserId;
        joinerRole = 'mentor';
      } else {
        targetUserId = mentorUserId;
        joinerRole = 'mentee';
      }

      if (!targetUserId) {
        LoggerUtil.warn('mentorship:notify-join — target user not resolved', { sessionId, mentorUserId, menteeUserId });
        return;
      }

      // 1) Real-time signal — target abhi online ho tabhi kaam karega
      emitToUser(targetUserId, 'mentorship:peer-joined', {
        sessionId,
        joinerRole,
        title: title || 'Mentorship Session',
      });

      // 2) Persistent bell notification — offline hone par bhi save rahega
      await notificationService.sendNotification({
        userId: targetUserId,
        type: NotificationType.SESSION_STARTED,
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        module: sessionInfo.isSenior ? 'senior-mentor' : 'industry-mentor',
        data: {
          ...(joinerRole === 'mentee' && menteeUserId ? { menteeId: menteeUserId } : {}),
          title: `${joinerRole === 'mentor' ? 'Mentor' : 'Mentee'} joined the session`,
          message: `${joinerRole === 'mentor' ? 'Your mentor' : 'Your mentee'} has joined "${title || 'the session'}". Join now to start the call.`,
          sessionId,
          // Mentee ke aane par mentor ko mentor-session room (End Session wala) par bhejo
          actionUrl:
            joinerRole === 'mentee'
              ? `/mentorship/mentor-session?sessionId=${sessionId}&roomId=${bookingIdStr}&bookingId=${bookingIdStr}&role=mentor`
              : `/mentorship/session-room/${sessionId}?bookingId=${bookingIdStr}`,
        },
      });

      LoggerUtil.info('mentorship:notify-join handled', { sessionId, joinerRole, targetUserId });
    } catch (err: any) {
      LoggerUtil.error('mentorship:notify-join failed', { error: err.message });
    }
  });

  // ✅ live-call emoji reactions (👍 ❤️ 😂 👏 🎉)
  socket.on('mentorship:send-reaction', async (data: { sessionId: string; emoji: string }) => {
    try {
      const { sessionId, emoji } = data;
      if (!sessionId || !emoji) return;

      const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '👏', '🎉'];
      if (!ALLOWED_REACTIONS.includes(emoji)) return;

      const sessionInfo = await resolveMentorshipSession(sessionId);
      if (!sessionInfo) return;

      const { mentorUserId, menteeUserId } = sessionInfo;
      const targetUserId = userId === mentorUserId ? menteeUserId : mentorUserId;
      if (!targetUserId) return;

      emitToUser(targetUserId, 'mentorship:reaction-received', {
        sessionId,
        emoji,
        fromUserId: userId,
      });
    } catch (err: any) {
      LoggerUtil.error('mentorship:send-reaction failed', { error: err.message });
    }
  });
};
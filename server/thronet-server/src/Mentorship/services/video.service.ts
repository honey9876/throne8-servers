import config from '@/config/env/env';
import { logger } from '@/shared/logger.util';
import { nanoid } from 'nanoid';

interface MeetingDetails {
  platform: 'zoom' | 'google_meet' | 'daily_co' | 'custom';
  meetingUrl: string;
  meetingId: string;
  passcode?: string;
  startUrl?: string;
  hostKey?: string;
  participantToken?: string; // ✅ Added: guest token for private rooms
}

interface CreateMeetingOptions {
  topic: string;
  startTime: Date;
  duration: number;
  timezone: string;
  agenda?: string;
  hostEmail?: string;
  attendeeName?: string;
}

class VideoService {
  private platform: string;
  private isConfigured: boolean = false;

  constructor() {
    this.platform = config.VIDEO_PLATFORM || 'daily_co';
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (this.platform === 'zoom') {
      this.isConfigured = !!(config.ZOOM_API_KEY && config.ZOOM_API_SECRET);
    } else if (this.platform === 'google_meet') {
      this.isConfigured = !!config.GOOGLE_MEET_API_KEY;
    } else if (this.platform === 'daily_co') {
      this.isConfigured = !!config.DAILY_CO_API_KEY;
    } else {
      this.isConfigured = true; // Custom platform — assume configured
    }

    if (!this.isConfigured) {
      logger.warn(`🎥 Video platform ${this.platform} not fully configured`);
    } else {
      logger.info(`🎥 Video service ready: ${this.platform}`);
    }
  }

  async createMeeting(options: CreateMeetingOptions): Promise<MeetingDetails> {
    try {
      logger.info(`🎥 Creating ${this.platform} meeting: ${options.topic}`);

      if (this.platform === 'zoom') {
        return await this.createZoomMeeting(options);
      } else if (this.platform === 'google_meet') {
        return await this.createGoogleMeet(options);
      } else if (this.platform === 'daily_co') {
        return await this.createDailyCoMeeting(options);
      } else {
        return this.createCustomMeeting(options);
      }
    } catch (error: any) {
      // ✅ FIX: Correct template literal
      logger.error(`🎥 Failed to create meeting: ${error.message}`);
      throw new Error('Failed to create video meeting');
    }
  }

  /**
   * Zoom meeting creation.
   * TODO: Integrate actual Zoom API before production.
   * SDK: @zoomus/websdk or REST API with JWT auth.
   */
  private async createZoomMeeting(_options: CreateMeetingOptions): Promise<MeetingDetails> {
    try {
      // TODO: Implement Zoom API:
      // POST https://api.zoom.us/v2/users/me/meetings
      // Body: { topic, type: 2, start_time, duration, timezone, settings: { waiting_room: true } }
      // Auth: Bearer JWT (key + secret)
      logger.warn('🎥 Zoom meeting created (mock — not production ready)');

      return {
        platform:   'zoom',
        meetingUrl: `https://zoom.us/j/${nanoid(10)}`,
        meetingId:  nanoid(10),
        passcode:   nanoid(6),
        startUrl:   `https://zoom.us/s/${nanoid(10)}`,
      };
    } catch (error: any) {
      logger.error(`🎥 Zoom meeting creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Google Meet creation.
   * TODO: Integrate Google Calendar API before production.
   * Google Meet rooms are created by inserting a Calendar event with conferenceData.
   */
  private async createGoogleMeet(_options: CreateMeetingOptions): Promise<MeetingDetails> {
    try {
      // TODO: Implement via Google Calendar API:
      // POST https://www.googleapis.com/calendar/v3/calendars/primary/events
      // Body includes conferenceData: { createRequest: { requestId, conferenceSolutionKey } }
      logger.warn('🎥 Google Meet created (mock — not production ready)');

      return {
        platform:   'google_meet',
        meetingUrl: `https://meet.google.com/${nanoid(12)}`,
        meetingId:  nanoid(12),
      };
    } catch (error: any) {
      logger.error(`🎥 Google Meet creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Daily.co meeting creation.
   *
   * ✅ FIX: Added participant token generation.
   * Daily.co private rooms require each participant to have a meeting token
   * to be allowed in. Without this, only the room owner can join.
   * See: https://docs.daily.co/reference/rest-api/meeting-tokens
   */
  private async createDailyCoMeeting(options: CreateMeetingOptions): Promise<MeetingDetails> {
    try {
      if (!config.DAILY_CO_API_KEY) {
        throw new Error('Daily.co API key not configured');
      }

      const roomName       = `session-${nanoid(10)}`;
      const startTimeUnix  = Math.floor(options.startTime.getTime() / 1000);
      const expiryTimeUnix = startTimeUnix + options.duration * 60 + 3600; // +1h buffer

      // Step 1: Create the room
      const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${config.DAILY_CO_API_KEY}`,
        },
        body: JSON.stringify({
          name:    roomName,
          privacy: 'private',
          properties: {
            start_video_off:    false,
            start_audio_off:    false,
            enable_screenshare: true,
            enable_chat:        true,
            enable_recording:   'cloud',
            exp:                expiryTimeUnix,
            nbf:                startTimeUnix - 600, // 10 min early join
            max_participants:   2,
          },
        }),
      });

      if (!roomResponse.ok) {
        const errorText = await roomResponse.text();
        throw new Error(`Daily.co room creation failed: ${errorText}`);
      }

      const roomData: any = await roomResponse.json();
      logger.info(`🎥 Daily.co room created: ${roomData.url}`);

      // Step 2: Generate participant token (✅ FIX)
      // Without this token, participants cannot join a private room.
      let participantToken: string | undefined;
      try {
        const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${config.DAILY_CO_API_KEY}`,
          },
          body: JSON.stringify({
            properties: {
              room_name:    roomName,
              exp:          expiryTimeUnix,
              nbf:          startTimeUnix - 600,
              is_owner:     false, // Mentee token — not host
              enable_recording: false,
            },
          }),
        });

        if (tokenResponse.ok) {
          const tokenData: any = await tokenResponse.json();
          participantToken = tokenData.token;
          logger.info('🎥 Daily.co participant token generated');
        } else {
          logger.warn('🎥 Failed to generate Daily.co participant token — participants may not be able to join private room');
        }
      } catch (tokenError: any) {
        logger.warn(`🎥 Participant token generation failed: ${tokenError.message}`);
      }

      return {
        platform:         'daily_co',
        meetingUrl:       roomData.url,
        meetingId:        roomData.name,
        participantToken,
      };
    } catch (error: any) {
      logger.error(`🎥 Daily.co meeting creation failed: ${error.message}`);
      throw error;
    }
  }

  private createCustomMeeting(_options: CreateMeetingOptions): MeetingDetails {
    const meetingId  = nanoid(12);
    const meetingUrl = `${config.CUSTOM_VIDEO_URL || 'https://meet.example.com'}/${meetingId}`;

    logger.info(`🎥 Custom meeting created: ${meetingUrl}`);

    return {
      platform:   'custom',
      meetingUrl,
      meetingId,
      passcode:   nanoid(6),
    };
  }

  async deleteMeeting(meetingId: string): Promise<boolean> {
    try {
      if (this.platform === 'daily_co') {
        return await this.deleteDailyCoRoom(meetingId);
      }

      logger.info(`🎥 Meeting deletion not implemented for ${this.platform}`);
      return true;
    } catch (error: any) {
      logger.error(`🎥 Failed to delete meeting: ${error.message}`);
      return false;
    }
  }

  private async deleteDailyCoRoom(roomName: string): Promise<boolean> {
    try {
      if (!config.DAILY_CO_API_KEY) return false;

      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${config.DAILY_CO_API_KEY}` },
      });

      if (!response.ok) {
        logger.error(`🎥 Failed to delete Daily.co room: ${response.statusText}`);
        return false;
      }

      logger.info(`🎥 Daily.co room deleted: ${roomName}`);
      return true;
    } catch (error: any) {
      logger.error(`🎥 Daily.co room deletion failed: ${error.message}`);
      return false;
    }
  }

  async getMeetingDetails(meetingId: string): Promise<MeetingDetails | null> {
    try {
      if (this.platform === 'daily_co') {
        return await this.getDailyCoRoomDetails(meetingId);
      }

      logger.warn(`🎥 Get meeting details not implemented for ${this.platform}`);
      return null;
    } catch (error: any) {
      logger.error(`🎥 Failed to get meeting details: ${error.message}`);
      return null;
    }
  }

  private async getDailyCoRoomDetails(roomName: string): Promise<MeetingDetails | null> {
    try {
      if (!config.DAILY_CO_API_KEY) return null;

      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        headers: { Authorization: `Bearer ${config.DAILY_CO_API_KEY}` },
      });

      if (!response.ok) return null;

      const data: any = await response.json();
      return {
        platform:   'daily_co',
        meetingUrl: data.url,
        meetingId:  data.name,
      };
    } catch (error: any) {
      logger.error(`🎥 Failed to get Daily.co room details: ${error.message}`);
      return null;
    }
  }

  getPlatform(): string {
    return this.platform;
  }

  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}

export default new VideoService();
/**
 * ====================================
 * LIVE ROOM TYPE DEFINITIONS
 * ====================================
 */

import { Types } from 'mongoose';

/**
 * Create Live Room Request
 */
export interface CreateLiveRoomRequest {
  groupId: string;
  title: string;
  description?: string;
  maxParticipants?: number;
  settings?: {
    allowCamera?: boolean;
    allowMic?: boolean;
    allowScreenShare?: boolean;
    requireApproval?: boolean;
    muteOnEntry?: boolean;
  };
}

/**
 * Update Live Room Request
 */
export interface UpdateLiveRoomRequest {
  title?: string;
  description?: string;
  maxParticipants?: number;
  settings?: {
    allowCamera?: boolean;
    allowMic?: boolean;
    allowScreenShare?: boolean;
    requireApproval?: boolean;
    muteOnEntry?: boolean;
  };
}

/**
 * Join Live Room Request
 */
export interface JoinLiveRoomRequest {
  cameraOn?: boolean;
  micOn?: boolean;
}

/**
 * Toggle Camera Request
 */
export interface ToggleCameraRequest {
  cameraOn: boolean;
}

/**
 * Toggle Mic Request
 */
export interface ToggleMicRequest {
  micOn: boolean;
}

/**
 * Toggle Screen Share Request
 */
export interface ToggleScreenShareRequest {
  sharing: boolean;
}

/**
 * Live Room Query Filters
 */
export interface LiveRoomQueryFilters {
  groupId?: string;
  isActive?: boolean;
  host?: string;
  page?: number;
  limit?: number;
}

/**
 * Participant Info Response
 */
export interface ParticipantInfo {
  userId: Types.ObjectId | string;
  userName?: string;
  userAvatar?: string;
  joinedAt: Date;
  leftAt?: Date;
  cameraOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Live Room Response
 */
export interface LiveRoomResponse {
  _id: Types.ObjectId | string;
  group: Types.ObjectId | string;
  title: string;
  description?: string;
  host: Types.ObjectId | string;
  participants: ParticipantInfo[];
  maxParticipants: number;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  isRecording: boolean;
  settings: {
    allowCamera: boolean;
    allowMic: boolean;
    allowScreenShare: boolean;
    requireApproval: boolean;
    muteOnEntry: boolean;
  };
  stats: {
    totalParticipants: number;
    peakParticipants: number;
    totalDuration: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Live Room Stats Response
 */
export interface LiveRoomStatsResponse {
  totalSessions: number;
  totalDuration: number;
  averageDuration: number;
  totalParticipants: number;
  averageParticipants: number;
  peakParticipants: number;
}
/**
 * ====================================
 * SOCKET TYPE DEFINITIONS
 * ====================================
 * Type definitions for Socket.io
 */

import { Socket } from 'socket.io';

/**
 * Authenticated Socket interface
 * Extends Socket.io Socket with custom data properties
 */
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
  userId?: string;
  userName?: string;
}

/**
 * Socket event payloads
 */
export interface JoinGroupPayload {
  groupId: string;
}

export interface LeaveGroupPayload {
  groupId: string;
}

export interface JoinLiveRoomPayload {
  roomId: string;
}

export interface LeaveLiveRoomPayload {
  roomId: string;
}

export interface ToggleCameraPayload {
  roomId: string;
  cameraOn: boolean;
}

export interface ToggleMicPayload {
  roomId: string;
  micOn: boolean;
}

export interface ToggleScreenSharePayload {
  roomId: string;
  sharing: boolean;
}

export interface GetRoomParticipantsPayload {
  roomId: string;
}

export interface WebRTCOfferPayload {
  roomId: string;
  targetUserId: string;
  offer: any;
}

export interface WebRTCAnswerPayload {
  roomId: string;
  targetUserId: string;
  answer: any;
}

export interface WebRTCIceCandidatePayload {
  roomId: string;
  targetUserId: string;
  candidate: any;
}

export interface SendNotificationPayload {
  targetUserId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

export interface MarkNotificationReadPayload {
  notificationId: string;
}

export interface DeleteNotificationPayload {
  notificationId: string;
}

/**
 * Socket response payloads
 */
export interface ErrorResponse {
  event?: string;
  message: string;
}

export interface JoinedGroupResponse {
  groupId: string;
  message: string;
}

export interface LeftGroupResponse {
  groupId: string;
  message: string;
}

export interface UserJoinedGroupResponse {
  userId: string;
  groupId: string;
  timestamp: Date;
}

export interface UserLeftGroupResponse {
  userId: string;
  groupId: string;
  timestamp: Date;
}

export interface UserOnlineResponse {
  userId: string;
  timestamp: Date;
}

export interface UserOfflineResponse {
  userId: string;
  lastSeen: Date;
}

export interface RoomParticipant {
  userId: string;
  userName: string;
  socketId: string;
}

export interface RoomParticipantsListResponse {
  roomId: string;
  participants: RoomParticipant[];
  count: number;
}

export interface NewNotificationResponse {
  type: string;
  title: string;
  message: string;
  link?: string;
  timestamp: Date;
}

export interface UnreadNotificationCountResponse {
  count: number;
}
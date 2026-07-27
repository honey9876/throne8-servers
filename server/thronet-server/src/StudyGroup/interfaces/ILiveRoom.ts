/**
 * ====================================
 * LIVE ROOM INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';

export interface IParticipant {
  user: Types.ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  cameraOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ILiveRoom extends Document {
  _id: Types.ObjectId;
  group: Types.ObjectId;
  title: string;
  description?: string;
  host: Types.ObjectId;
  participants: IParticipant[];
  maxParticipants: number;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date;
  duration?: number; // in minutes
  recordingUrl?: string;
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
    totalDuration: number; // in minutes
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ILiveRoomMethods {
  addParticipant(userId: Types.ObjectId): Promise<void>;
  removeParticipant(userId: Types.ObjectId): Promise<void>;
  toggleCamera(userId: Types.ObjectId, cameraOn: boolean): Promise<void>;
  toggleMic(userId: Types.ObjectId, micOn: boolean): Promise<void>;
  toggleScreenShare(userId: Types.ObjectId, sharing: boolean): Promise<void>;
  endSession(): Promise<void>;
  getActiveParticipants(): IParticipant[];
}

export type ILiveRoomDocument = ILiveRoom & ILiveRoomMethods;
/**
 * ====================================
 * LIVE ROOM MODEL
 * ====================================
 */

import mongoose, { Schema } from 'mongoose';
import { ILiveRoomDocument, IParticipant } from '../interfaces/ILiveRoom';

const participantSchema = new Schema<IParticipant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    cameraOn: {
      type: Boolean,
      default: false,
    },
    micOn: {
      type: Boolean,
      default: false,
    },
    screenSharing: {
      type: Boolean,
      default: false,
    },
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good',
    },
  },
  { _id: false }
);

const liveRoomSchema = new Schema<ILiveRoomDocument>(
  {
    group: {
      type: Schema.Types.ObjectId,
      ref: 'StudyGroup_Group',
      required: [true, 'Group is required'],
    },
    title: {
      type: String,
      required: [true, 'Live room title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title must not exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Host is required'],
    },
    participants: {
      type: [participantSchema],
      default: [],
    },
    maxParticipants: {
      type: Number,
      default: 50,
      min: [2, 'At least 2 participants required'],
      max: [100, 'Maximum 100 participants allowed'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    isRecording: {
      type: Boolean,
      default: false,
    },
    settings: {
      allowCamera: {
        type: Boolean,
        default: true,
      },
      allowMic: {
        type: Boolean,
        default: true,
      },
      allowScreenShare: {
        type: Boolean,
        default: true,
      },
      requireApproval: {
        type: Boolean,
        default: false,
      },
      muteOnEntry: {
        type: Boolean,
        default: false,
      },
    },
    stats: {
      totalParticipants: {
        type: Number,
        default: 0,
      },
      peakParticipants: {
        type: Number,
        default: 0,
      },
      totalDuration: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Indexes
 */
liveRoomSchema.index({ group: 1, isActive: 1 });
liveRoomSchema.index({ host: 1, isActive: 1 });
liveRoomSchema.index({ startedAt: -1 });
liveRoomSchema.index({ 'participants.user': 1 });

/**
 * Virtual: Active participants count
 */
liveRoomSchema.virtual('activeParticipantsCount').get(function () {
  return this.participants.filter((p: IParticipant) => !p.leftAt).length;
});

/**
 * Method: Add participant
 */
liveRoomSchema.methods.addParticipant = async function (userId: mongoose.Types.ObjectId) {
  const existingParticipant = this.participants.find(
    (p: IParticipant) => p.user.toString() === userId.toString() && !p.leftAt
  );

  if (existingParticipant) {
    throw new Error('User is already in the room');
  }

  const activeCount = this.participants.filter((p: IParticipant) => !p.leftAt).length;
  if (activeCount >= this.maxParticipants) {
    throw new Error('Room is at maximum capacity');
  }

  this.participants.push({
    user: userId,
    joinedAt: new Date(),
    cameraOn: !this.settings.muteOnEntry,
    micOn: !this.settings.muteOnEntry,
    screenSharing: false,
  } as IParticipant);

  this.stats.totalParticipants += 1;
  const currentActive = this.participants.filter((p: IParticipant) => !p.leftAt).length;
  if (currentActive > this.stats.peakParticipants) {
    this.stats.peakParticipants = currentActive;
  }

  await this.save();
};

/**
 * Method: Remove participant
 */
liveRoomSchema.methods.removeParticipant = async function (userId: mongoose.Types.ObjectId) {
  const participant = this.participants.find(
    (p: IParticipant) => p.user.toString() === userId.toString() && !p.leftAt
  );

  if (!participant) {
    throw new Error('User is not in the room');
  }

  participant.leftAt = new Date();
  await this.save();
};

/**
 * Method: Toggle camera
 */
liveRoomSchema.methods.toggleCamera = async function (
  userId: mongoose.Types.ObjectId,
  cameraOn: boolean
) {
  const participant = this.participants.find(
    (p: IParticipant) => p.user.toString() === userId.toString() && !p.leftAt
  );

  if (!participant) {
    throw new Error('User is not in the room');
  }

  if (!this.settings.allowCamera && cameraOn) {
    throw new Error('Camera is not allowed in this room');
  }

  participant.cameraOn = cameraOn;
  await this.save();
};

/**
 * Method: Toggle mic
 */
liveRoomSchema.methods.toggleMic = async function (
  userId: mongoose.Types.ObjectId,
  micOn: boolean
) {
  const participant = this.participants.find(
    (p: IParticipant) => p.user.toString() === userId.toString() && !p.leftAt
  );

  if (!participant) {
    throw new Error('User is not in the room');
  }

  if (!this.settings.allowMic && micOn) {
    throw new Error('Microphone is not allowed in this room');
  }

  participant.micOn = micOn;
  await this.save();
};

/**
 * Method: Toggle screen share
 */
liveRoomSchema.methods.toggleScreenShare = async function (
  userId: mongoose.Types.ObjectId,
  sharing: boolean
) {
  const participant = this.participants.find(
    (p: IParticipant) => p.user.toString() === userId.toString() && !p.leftAt
  );

  if (!participant) {
    throw new Error('User is not in the room');
  }

  if (!this.settings.allowScreenShare && sharing) {
    throw new Error('Screen sharing is not allowed in this room');
  }

  participant.screenSharing = sharing;
  await this.save();
};

/**
 * Method: Get active participants
 */
liveRoomSchema.methods.getActiveParticipants = function () {
  return this.participants.filter((p: IParticipant) => !p.leftAt);
};

/**
 * Method: End session
 */
liveRoomSchema.methods.endSession = async function () {
  this.isActive = false;
  this.endedAt = new Date();

  const durationMs = this.endedAt.getTime() - this.startedAt.getTime();
  this.duration = Math.round(durationMs / (1000 * 60));

  this.stats.totalDuration = this.duration;

  this.participants.forEach((p: IParticipant) => {
    if (!p.leftAt) {
      p.leftAt = new Date();
    }
  });

  await this.save();
};

const LiveRoom = mongoose.model<ILiveRoomDocument>('StudyGroup_LiveRoom', liveRoomSchema);

export default LiveRoom;
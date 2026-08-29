import mongoose, { Schema, Document, Model, Mongoose } from 'mongoose';
import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';
import { generateSecureId } from '@/shared/security';

// Enums
export enum MessageType {
  DIRECT_RECRUITER = 'direct_recruiter',
  SYSTEM = 'system',
  APPLICATION_UPDATE = 'application_update'
}

// Interface
export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  senderId: string;
  recipientId: string;
  message: string;
  jobId: string | null;
  messageType: MessageType;
  sentAt: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const messageSchema = new Schema<IMessage>(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: uuidv4,
      validate: {
        validator: (v: string) => uuidValidate(v) && uuidVersion(v) === 4,
        message: 'Invalid UUID for _id',
      },
    },  
    senderId: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => uuidValidate(v) && uuidVersion(v) === 4,
        message: 'Invalid UUID for senderId',
      },
    },
    recipientId: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => uuidValidate(v) && uuidVersion(v) === 4,
        message: 'Invalid UUID for recipientId',
      },
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    jobId: {
      type: String,
      default: null,
      validate: {
        validator: (v: string | null) => v === null || (uuidValidate(v) && uuidVersion(v) === 4),
        message: 'Invalid UUID for jobId',
      },
    },
    messageType: {
      type: String,
      enum: {
        values: Object.values(MessageType),
        message: '{VALUE} is not a valid message type',
      },
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
messageSchema.index({ senderId: 1, isDeleted: 1 });
messageSchema.index({ recipientId: 1, isDeleted: 1 });
messageSchema.index({ jobId: 1, isDeleted: 1 });
messageSchema.index({ sentAt: -1, isDeleted: 1 });

// Pre-save hook to ensure UUIDs are valid
messageSchema.pre<IMessage>('save', function (next) {
   next();
});

// Export model
export const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);

export default Message;
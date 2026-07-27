import { model, Schema } from 'mongoose';

export interface IAdmin {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'SuperAdmin' | 'Admin' | 'Moderator';
  isActive: boolean;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IAdminModel {
  findByEmail(email: string): Promise<IAdmin | null>;
  findActive(): Promise<IAdmin[]>;
  hasPermission(adminId: string, permission: string): Promise<boolean>;
}


export const AdminSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['SuperAdmin', 'Admin', 'Moderator'],
      default: 'Admin',
    },
    permissions: [
      {
        type: String,
        enum: [
          'manage_companies',
          'manage_users',
          'manage_posts',
          'manage_reviews',
          'manage_admins',
          'view_analytics',
        ],
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: Date,
    auditLogs: [
      {
        action: String,
        entityType: String,
        entityId: Schema.Types.ObjectId,
        changes: Schema.Types.Mixed,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        ipAddress: String,
      },
    ],
  },
  {
    timestamps: true,
    collection: 'admins',
  }
);

// Index for active admins
AdminSchema.index({ isActive: 1, role: 1 });
AdminSchema.index({ lastLogin: -1 });


AdminSchema.statics.findByEmail = async function (email: string) {
  return this.findOne({ email });
};

AdminSchema.statics.findActive = async function () {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

AdminSchema.statics.hasPermission = async function (
  adminId: string,
  permission: string
) {
  const admin = await this.findById(adminId);
  if (!admin) return false;
  if (admin.role === 'SuperAdmin') return true;
  return admin.permissions.includes(permission);
};

const Admin = model<IAdmin, IAdminModel>('Admin', AdminSchema);

export default Admin;
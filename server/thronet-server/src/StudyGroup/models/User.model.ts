/**
 * ====================================
 * USER MODEL (PRODUCTION READY - 100K+ USERS)
 * ====================================
 */

import mongoose, { Schema, Model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUser } from '../interfaces/IUser';
import { UserRole } from '../enums/UserRole.enum';
import { AUTH_CONSTANTS } from '../utils/constants';

interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
  generateRefreshToken(): string;
}

interface IUserStatics {
  findByEmail(email: string): Promise<(IUser & Document) | null>;
  findByUsername(username: string): Promise<(IUser & Document) | null>;
  findActiveUsers(): Promise<(IUser & Document)[]>;
  findRecentlyActiveUsers(days?: number): Promise<(IUser & Document)[]>;
  findByRole(role: UserRole): Promise<(IUser & Document)[]>;
}

type UserModel = Model<IUser, {}, IUserMethods> & IUserStatics;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must not exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    username: {
      type: String,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT,
    },
    avatar: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid phone number'],
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio must not exceed 500 characters'],
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).password;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: {
      transform: function (_doc, ret) {
        delete (ret as any).password;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

/**
 * ============================================
 * INDEXES (Optimized for 100K+ users)
 * ============================================
 */

// ✅ PRIMARY INDEXES - For unique constraints
userSchema.index({ email: 1 }, { unique: true, name: 'idx_email_unique' });
userSchema.index(
  { username: 1 }, 
  { unique: true, sparse: true, name: 'idx_username_unique' }
);

// ✅ QUERY OPTIMIZATION INDEXES - For filtering
userSchema.index({ role: 1 }, { name: 'idx_role' });
userSchema.index({ isActive: 1 }, { name: 'idx_isActive' });
userSchema.index({ createdAt: -1 }, { name: 'idx_createdAt_desc' });
userSchema.index({ lastActive: -1 }, { name: 'idx_lastActive_desc' });

// ✅ COMPOUND INDEXES - For complex queries (100K+ optimization)
userSchema.index(
  { role: 1, isActive: 1 }, 
  { name: 'idx_role_isActive' }
);

userSchema.index(
  { isActive: 1, lastActive: -1 }, 
  { name: 'idx_isActive_lastActive' }
);

userSchema.index(
  { role: 1, createdAt: -1 }, 
  { name: 'idx_role_createdAt' }
);

// ✅ TEXT INDEX - For search functionality (enable if needed)
// userSchema.index(
//   { name: 'text', username: 'text', email: 'text' },
//   { name: 'idx_text_search', weights: { name: 10, username: 5, email: 3 } }
// );

/**
 * ============================================
 * PRE-SAVE MIDDLEWARE
 * ============================================
 */

/**
 * Hash password before saving
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

/**
 * Auto-generate username from email if not provided
 */
userSchema.pre('save', function (next) {
  if (!this.username && this.email) {
    const emailParts = this.email.split('@');
    this.username = emailParts[0]?.toLowerCase() || '';
  }
  next();
});

/**
 * Update lastActive on every save
 */
userSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.lastActive = new Date();
  }
  next();
});

/**
 * ============================================
 * INSTANCE METHODS
 * ============================================
 */

/**
 * Compare password with hashed password
 */
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error : any) {
    return false;
  }
};

/**
 * Generate JWT access token
 */
userSchema.methods.generateAuthToken = function (): string {
  const payload = {
    userId: this._id.toString(),
    email: this.email,
    role: this.role,
  };

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: AUTH_CONSTANTS.JWT_EXPIRE,
  });
};

/**
 * Generate JWT refresh token
 */
userSchema.methods.generateRefreshToken = function (): string {
  const payload = {
    userId: this._id.toString(),
  };

  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error('REFRESH_TOKEN_SECRET is not defined');
  }

  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRE,
  });
};

/**
 * ============================================
 * STATIC METHODS (100K+ Optimization)
 * ============================================
 */

/**
 * Find user by email
 */
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

/**
 * Find user by username
 */
userSchema.statics.findByUsername = function (username: string) {
  return this.findOne({ username: username.toLowerCase() });
};

/**
 * Find active users only (uses compound index)
 */
userSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true }).lean();
};

/**
 * Find recently active users (last N days)
 */
userSchema.statics.findRecentlyActiveUsers = function (days: number = 7) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return this.find({ 
    isActive: true,
    lastActive: { $gte: dateThreshold } 
  })
  .sort({ lastActive: -1 })
  .lean();
};

/**
 * Find users by role (uses compound index)
 */
userSchema.statics.findByRole = function (role: UserRole) {
  return this.find({ role, isActive: true }).lean();
};

/**
 * ============================================
 * MODEL EXPORT
 * ============================================
 */

const User = mongoose.model<IUser, UserModel>('User', userSchema);

export default User;
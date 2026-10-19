/**
 * ====================================
 * ATTENDANCE MODEL
 * ====================================
 * Mongoose schema for daily attendance tracking
 */

import mongoose, { Schema } from "mongoose";
import { IAttendance } from "../interfaces/IAttendance";
import { AttendanceStatus } from "../enums/AttendanceStatus.enum";
import { validId } from "@/shared/security";
import { v4 as uuidv4 } from "uuid";

const attendanceSchema = new Schema<IAttendance>(
  {
    // ADD: attendanceId UUID
    // attendanceId: {
    //   type: String,
    //   required: true,
    //   unique: true,
    //   index: true,
    //   validate: (v: any) => validId(v),
    // },

    attendanceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
      validate: (v: any) => validId(v),
    },
    user: {
      type: String,
      ref: "User",
      required: [true, "User is required"],
    },

    // Attendance details
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(AttendanceStatus),
      default: AttendanceStatus.PRESENT,
    },

    // Check-in/Check-out
    checkInTime: {
      type: Date,
      default: undefined,
    },
    checkOutTime: {
      type: Date,
      default: undefined,
    },
    totalActiveTime: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Auto-attendance tracking
    wasAutoMarked: {
      type: Boolean,
      default: false,
    },
    autoMarkReason: {
      type: String,
      enum: ["study_session", "task_completion", "manual"],
      default: undefined,
    },

    // Study activity on this date
    studyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    sessionsCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    tasksCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Notes
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret: any) {
        ret.id = ret.attendanceId;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

/**
 * Indexes for better query performance
 */
attendanceSchema.index({ user: 1, date: -1 });
attendanceSchema.index({ user: 1, status: 1 });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ status: 1 });

/**
 * Compound unique index: One attendance record per user per date
 */
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

/**
 * Virtual: Is marked as present
 */
attendanceSchema.virtual("isPresent").get(function (this: any) {
  return this.status === AttendanceStatus.PRESENT;
});

/**
 * Virtual: Is marked as absent
 */
attendanceSchema.virtual("isAbsent").get(function (this: any) {
  return this.status === AttendanceStatus.ABSENT;
});

/**
 * Virtual: Is marked as late
 */
attendanceSchema.virtual("isLate").get(function (this: any) {
  return this.status === AttendanceStatus.LATE;
});

/**
 * Virtual: Total active time in hours
 */
attendanceSchema.virtual("activeHours").get(function (this: any) {
  if (!this.totalActiveTime || this.totalActiveTime === 0) return 0;
  return parseFloat((this.totalActiveTime / 3600).toFixed(2));
});

/**
 * Virtual: Has checked out
 */
attendanceSchema.virtual("hasCheckedOut").get(function (this: any) {
  return this.checkOutTime !== undefined && this.checkOutTime !== null;
});

/**
 * Pre-save hook: Set date to start of day
 */
attendanceSchema.pre("save", function (this: any, next) {
  if (this.isModified("date")) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0);
    this.date = d;
  }
  next();
});

/**
 * Pre-save hook: Calculate total active time if checked out
 */
attendanceSchema.pre("save", function (this: any, next) {
  if (this.checkInTime && this.checkOutTime) {
    const checkIn = new Date(this.checkInTime).getTime();
    const checkOut = new Date(this.checkOutTime).getTime();
    this.totalActiveTime = Math.floor((checkOut - checkIn) / 1000);
  }
  next();
});

/**
 * Pre-save hook: Auto-mark as late if check-in after 10 AM
 */
attendanceSchema.pre("save", function (this: any, next) {
  if (this.checkInTime && !this.isModified("status")) {
    const checkInHour = new Date(this.checkInTime).getHours();
    if (checkInHour >= 10) {
      this.status = AttendanceStatus.LATE;
    }
  }
  next();
});

// Invalidation hooks for study analytics
attendanceSchema.post('save', async function (doc: any) {
  const uid = doc?.user || doc?.userId;
  if (uid) {
    try {
      const { StudyAnalyticsCacheRepository } = await import('@/shared/cache/studyCache');
      await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
    } catch {}
  }
});

attendanceSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      let uid = filter.user || filter.userId;
      if (!uid && (filter._id || filter.attendanceId)) {
        const doc = await this.model.findOne(filter).select('user userId').lean();
        if (doc) this._targetUserId = doc.user || doc.userId;
      } else if (uid) {
        this._targetUserId = uid;
      }
    } catch {}
  }
);

attendanceSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any, res: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      const uid = this._targetUserId || filter.user || filter.userId || (res && (res.user || res.userId));
      if (uid) {
        const { StudyAnalyticsCacheRepository } = await import('@/shared/cache/studyCache');
        await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
      }
    } catch {}
  }
);

const Attendance = mongoose.model<IAttendance>(
  "StudyGroup_Attendance",
  attendanceSchema,
);

// Export both as default and named export
export { Attendance };
export default Attendance;

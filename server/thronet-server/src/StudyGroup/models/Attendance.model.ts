import mongoose, { Schema } from 'mongoose';
import { IAttendance } from '../interfaces/IAttendance';
import { AttendanceStatus } from '../enums/AttendanceStatus.enum';
import { validId } from '@/shared/security';

const attendanceSchema = new Schema(
  {
    attendanceId: {
      type: String,
      required: true,
      default: () => validId(''),
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    status: {
      type: String,
      enum: Object.values(AttendanceStatus),
      default: AttendanceStatus.PRESENT,
    },
    checkInTime: { type: Date, default: undefined },
    checkOutTime: { type: Date, default: undefined },
    totalActiveTime: { type: Number, default: 0, min: 0 },
    wasAutoMarked: { type: Boolean, default: false },
    autoMarkReason: {
      type: String,
      enum: ['study_session', 'task_completion', 'manual'],
      default: undefined,
    },
    studyHours: { type: Number, default: 0, min: 0 },
    sessionsCompleted: { type: Number, default: 0, min: 0 },
    tasksCompleted: { type: Number, default: 0, min: 0 },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        const r = ret as any;
        r.id = r.attendanceId;
        delete r._id;
        delete r.__v;
        return r;
      },
    },
    toObject: { virtuals: true },
  }
);

attendanceSchema.index({ attendanceId: 1 }, { unique: true });
attendanceSchema.index({ user: 1, date: -1 });
attendanceSchema.index({ user: 1, status: 1 });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

attendanceSchema.virtual('isPresent').get(function (this: IAttendance) {
  return this.status === AttendanceStatus.PRESENT;
});

attendanceSchema.virtual('isAbsent').get(function (this: IAttendance) {
  return this.status === AttendanceStatus.ABSENT;
});

attendanceSchema.virtual('isLate').get(function (this: IAttendance) {
  return this.status === AttendanceStatus.LATE;
});

attendanceSchema.virtual('activeHours').get(function (this: IAttendance) {
  if (!this.totalActiveTime || this.totalActiveTime === 0) return 0;
  return parseFloat((this.totalActiveTime / 3600).toFixed(2));
});

attendanceSchema.virtual('hasCheckedOut').get(function (this: IAttendance) {
  return this.checkOutTime !== undefined && this.checkOutTime !== null;
});

attendanceSchema.pre('save', function (this: IAttendance, next) {
  if (this.isModified('date')) {
    const d = new Date(this.date);
    d.setHours(0, 0, 0, 0);
    this.date = d;
  }
  next();
});

attendanceSchema.pre('save', function (this: IAttendance, next) {
  if (this.checkInTime && this.checkOutTime) {
    const checkIn = new Date(this.checkInTime).getTime();
    const checkOut = new Date(this.checkOutTime).getTime();
    this.totalActiveTime = Math.floor((checkOut - checkIn) / 1000);
  }
  next();
});

attendanceSchema.pre('save', function (this: IAttendance, next) {
  if (this.checkInTime && !this.isModified('status')) {
    const checkInHour = new Date(this.checkInTime).getHours();
    if (checkInHour >= 10) {
      this.status = AttendanceStatus.LATE;
    }
  }
  next();
});

const Attendance = mongoose.model<IAttendance>('StudyGroup_Attendance', attendanceSchema);

export { Attendance };
export default Attendance;
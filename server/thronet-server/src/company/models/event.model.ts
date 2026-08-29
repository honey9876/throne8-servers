import mongoose, { Model, Query, Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Type definition
export interface IEventDocument extends Document {
  eventId: string;
  title: string;
  slug: string;
  description?: string;
  company: mongoose.Types.ObjectId;
  type: string;
  startDate: Date;
  endDate?: Date;
  location?: {
    venue?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: {
      type: string;
      coordinates: number[];
    };
  };
  mode: string;
  eventLink?: string;
  banner?: string;
  capacity?: number;
  registeredCount: number;
  registrations?: Array<{
    employee?: mongoose.Types.ObjectId;
    email?: string;
    phone?: string;
    registeredAt: Date;
    attended?: boolean;
  }>;
  speakers?: Array<{
    name: string;
    designation?: string;
    company?: string;
    bio?: string;
    image?: string;
  }>;
  agenda?: Array<{
    time?: string;
    timeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
    title: string;
    description?: string;
    speaker?: string;
    duration?: number;
  }>;

  media?: Array<{
    url: string;
    type: 'Image' | 'Video' | 'Document';
    name?: string;
    size?: number;
    caption?: string;
    isPrimary?: boolean;
  }>;

  visibility?: 'Public' | 'Private';
  startTimeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  endTimeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  scheduledFor?: Date;
  isPublished?: boolean;
  publishedAt?: Date;
  status: string;
  feedbackSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// INTERFACE DEFINITIONS
// =====================================================

interface IEventMethods {
  incrementRegistrations(): Promise<Document & IEventDocument>;
  decrementRegistrations(): Promise<Document & IEventDocument>;
  checkCapacity(): boolean;
  isFull(): boolean;
  availableSeats(): number;
  cancel(): Promise<Document & IEventDocument>;
  updateStatus(status: string): Promise<Document & IEventDocument>;
}

interface IEventModel extends Model<IEventDocument, Record<string, never>, IEventMethods> {
  findActiveEvents(): Query<IEventDocument[], IEventDocument>;
  findUpcomingEvents(daysAhead?: number): Query<IEventDocument[], IEventDocument>;
  findPastEvents(): Query<IEventDocument[], IEventDocument>;
  findByCompany(companyId: string, page?: number, pageSize?: number): Promise<{ events: IEventDocument[]; total: number }>;
  findByType(type: string, page?: number, pageSize?: number): Promise<{ events: IEventDocument[]; total: number }>;
  findByMode(mode: string): Query<IEventDocument[], IEventDocument>;
  searchEvents(searchTerm: string, page?: number, pageSize?: number): Promise<{ events: IEventDocument[]; total: number }>;
  findNearby(longitude: number, latitude: number, maxDistance?: number): Query<IEventDocument[], IEventDocument>;
  countByStatus(status: string): Promise<number>;
  countByCompany(companyId: string): Promise<number>;
  getUpcomingCount(companyId?: string): Promise<number>;
}

// =====================================================
// schema
// =====================================================

export const EventSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      sparse: true,  // ? ADD THIS - allows null values
    },
    description: String,
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    type: {
      type: String,
      enum: ['Conference', 'Webinar', 'Workshop', 'Meetup', 'Other'],
      default: 'Conference',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    startTimeOfDay: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening', 'Night'],
    },
    endTimeOfDay: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening', 'Night'],
    },

    // Scheduled event support (same as post)
    scheduledFor: { type: Date },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },

    location: {
      venue: String,
      address: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: {
          type: [Number],  // ? ARRAY OF 2 NUMBERS
          default: [0, 0],
        },
      },
    },
    mode: {
      type: String,
      enum: ['Online', 'Offline', 'Hybrid', 'Virtual', 'In-Person'],  // add Virtual, In-Person
      default: 'Offline',
    },
    eventLink: String,
    banner: String,
    capacity: Number,
    registeredCount: {
      type: Number,
      default: 0,
    },
    registrations: [
      {
        employee: {
          type: Schema.Types.ObjectId,
          ref: 'Employee',
        },
        email: String,
        phone: String,
        registeredAt: {
          type: Date,
          default: Date.now,
        },
        attended: Boolean,
      },
    ],
    speakers: [
      {
        name: String,
        designation: String,
        company: String,
        bio: String,
        image: String,
      },
    ],
    agenda: [
      {
        time: { type: String, trim: true },           // "10:00 AM"
        timeOfDay: {
          type: String,
          enum: ['Morning', 'Afternoon', 'Evening', 'Night']
        },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, trim: true, maxlength: 500 },
        speaker: { type: String, trim: true },
        duration: { type: Number },                    // minutes mein
      }
    ],
    media: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ['Image', 'Video', 'Document'] },
        name: { type: String },
        size: { type: Number },
        caption: { type: String, maxlength: 500 },
        isPrimary: { type: Boolean, default: false },  // cover image flag
      }
    ],
    visibility: {
      type: String,
      enum: ['Public', 'Private'],
      default: 'Public',
    },
    status: {
      type: String,
      enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled', 'Scheduled'],  // add Scheduled
      default: 'Upcoming',
    },
    feedbackSentAt: Date,
  },
  {
    timestamps: true,
    collection: 'events',
    versionKey: false,
  }
);

// TTL Index - auto delete events 1 year after completion
EventSchema.index(
  { endDate: 1 },
  {
    expireAfterSeconds: 31536000,
    partialFilterExpression: { status: 'Completed' },
  }
);




// =====================================================
// PRE-SAVE MIDDLEWARE
// =====================================================

EventSchema.pre('save', async function (next) {
  // Auto-generate slug from title
  if (this.isModified('title') && !this.slug) {
    const baseSlug = (this.title as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;

    const EventModel = mongoose.models.Event || mongoose.model('Event', EventSchema);
    while (await EventModel.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }

  // Auto-update status based on dates
  const now = new Date();
  const startDate = new Date(this.startDate as Date);
  const endDate = this.endDate ? new Date(this.endDate) : null;

  if (now < startDate) {
    this.status = 'Upcoming';
  } else if (endDate && now > endDate) {
    this.status = 'Completed';
  } else if (now >= startDate && (!endDate || now <= endDate)) {
    this.status = 'Ongoing';
  }

  next();
});

// =====================================================
// INSTANCE METHODS
// =====================================================

EventSchema.methods.incrementRegistrations = async function (this: Document & IEventDocument) {
  this.registeredCount = (this.registeredCount || 0) + 1;
  return this.save();
};

EventSchema.methods.decrementRegistrations = async function (this: Document & IEventDocument) {
  if ((this.registeredCount || 0) > 0) {
    this.registeredCount -= 1;
  }
  return this.save();
};

EventSchema.methods.checkCapacity = function (this: IEventDocument) {
  if (!this.capacity) return true;
  return (this.registeredCount || 0) < this.capacity;
};

EventSchema.methods.isFull = function (this: IEventDocument) {
  if (!this.capacity) return false;
  return (this.registeredCount || 0) >= this.capacity;
};

EventSchema.methods.availableSeats = function (this: IEventDocument) {
  if (!this.capacity) return Infinity;
  return Math.max(0, this.capacity - (this.registeredCount || 0));
};

EventSchema.methods.cancel = async function (this: Document & IEventDocument) {
  this.status = 'Cancelled';
  return this.save();
};

EventSchema.methods.updateStatus = async function (this: Document & IEventDocument, status: string) {
  this.status = status;
  return this.save();
};

// =====================================================
// STATIC METHODS
// =====================================================

EventSchema.statics.findActiveEvents = function () {
  return this.find({
    status: { $in: ['Upcoming', 'Ongoing'] },
  }).sort({ startDate: 1 });
};

EventSchema.statics.findUpcomingEvents = function (daysAhead = 30) {
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return this.find({
    status: 'Upcoming',
    startDate: { $gte: now, $lte: futureDate },
  })
    .sort({ startDate: 1 })
    .lean();
};

EventSchema.statics.findPastEvents = function () {
  return this.find({
    status: 'Completed',
    endDate: { $lt: new Date() },
  })
    .sort({ endDate: -1 })
    .lean();
};

EventSchema.statics.findByCompany = async function (
  companyId: string,
  page = 1,
  pageSize = 20
) {
  const skip = (page - 1) * pageSize;

  const [events, total] = await Promise.all([
    this.find({ company: companyId })
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('company', 'name logo')
      .lean(),
    this.countDocuments({ company: companyId }),
  ]);

  return { events, total };
};

EventSchema.statics.findByType = async function (
  type: string,
  page = 1,
  pageSize = 20
) {
  const skip = (page - 1) * pageSize;

  const [events, total] = await Promise.all([
    this.find({ type, status: { $in: ['Upcoming', 'Ongoing'] } })
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(pageSize)
      .populate('company', 'name logo')
      .lean(),
    this.countDocuments({ type, status: { $in: ['Upcoming', 'Ongoing'] } }),
  ]);

  return { events, total };
};

EventSchema.statics.findByMode = function (mode: string) {
  return this.find({
    mode,
    status: { $in: ['Upcoming', 'Ongoing'] },
  })
    .sort({ startDate: 1 })
    .lean();
};

EventSchema.statics.searchEvents = async function (
  searchTerm: string,
  page = 1,
  pageSize = 20
) {
  const skip = (page - 1) * pageSize;
  const searchRegex = new RegExp(searchTerm, 'i');

  const [events, total] = await Promise.all([
    this.find({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { 'location.city': searchRegex },
      ],
      status: { $in: ['Upcoming', 'Ongoing'] },
    })
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(pageSize)
      .populate('company', 'name logo')
      .lean(),
    this.countDocuments({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { 'location.city': searchRegex },
      ],
      status: { $in: ['Upcoming', 'Ongoing'] },
    }),
  ]);

  return { events, total };
};

EventSchema.statics.findNearby = function (
  longitude: number,
  latitude: number,
  maxDistance = 50000
) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance,
      },
    },
    status: { $in: ['Upcoming', 'Ongoing'] },
  })
    .sort({ startDate: 1 })
    .lean();
};

EventSchema.statics.countByStatus = function (status: string) {
  return this.countDocuments({ status });
};

EventSchema.statics.countByCompany = function (companyId: string) {
  return this.countDocuments({ company: companyId });
};

EventSchema.statics.getUpcomingCount = function (companyId?: string) {
  const query: Record<string, unknown> = {
    status: 'Upcoming',
    startDate: { $gte: new Date() },
  };

  if (companyId) {
    query.company = companyId;
  }

  return this.countDocuments(query);
};

// =====================================================
// VIRTUALS
// =====================================================

EventSchema.virtual('isUpcoming').get(function (this: IEventDocument) {
  return this.status === 'Upcoming' && new Date() < new Date(this.startDate);
});

EventSchema.virtual('isPast').get(function (this: IEventDocument) {
  return this.status === 'Completed' && this.endDate && new Date() > new Date(this.endDate);
});

EventSchema.virtual('isOngoing').get(function (this: IEventDocument) {
  return this.status === 'Ongoing';
});

EventSchema.virtual('registrationRate').get(function (this: IEventDocument) {
  if (!this.capacity || this.capacity === 0) return 0;
  return Math.round(((this.registeredCount || 0) / this.capacity) * 100);
});

EventSchema.virtual('daysUntilStart').get(function (this: IEventDocument) {
  const now = new Date();
  const startDate = new Date(this.startDate);
  const diffTime = startDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// =====================================================
// INDEXES
// =====================================================

EventSchema.index({ company: 1, startDate: -1 });
EventSchema.index({ status: 1, startDate: 1 });
EventSchema.index({ type: 1, mode: 1 });
EventSchema.index({ 'location.coordinates': '2dsphere' });
EventSchema.index({ title: 'text', description: 'text' });
EventSchema.index({ startDate: 1 }, { expireAfterSeconds: 31536000 });

// =====================================================
// JSON SERIALIZATION
// =====================================================

EventSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;
    return ret;
  },
});

EventSchema.set('toObject', { virtuals: true });

// =====================================================
// MODEL CREATION & EXPORT
// =====================================================

const Event = (mongoose.models['Event'] as IEventModel) ||
  mongoose.model<IEventDocument, IEventModel>('Event', EventSchema);

export default Event;
import { IEmployeeDocument } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';
import mongoose, { Model, Query, Document } from 'mongoose';
import { Schema } from 'mongoose';

export const EmployeeSchema = new Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
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
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    profileImage: String,
    bio: String,
    phone: String,
    location: {
      city: String,
      state: String,
      country: String,
    },
    joinDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    skills: [
      {
        type: String,
        lowercase: true,
      },
    ],
    socialLinks: {
      linkedin: String,
      twitter: String,
      github: String,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    advocacyScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    isAdvocate: {
      type: Boolean,
      default: false,
    },
    assignedAsAdvocateAt: {
      type: Date,
      default: null,
    },
    assignedAsAdvocateBy: {
      type: String,
      ref: 'User',
      default: null,
    },
    postsCount: {
      type: Number,
      default: 0,
    },
    followersCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'employees',
    versionKey: false,
  }
);

// Indexes
EmployeeSchema.index({
  firstName: 'text',
  lastName: 'text',
  bio: 'text',
  email: 'text',
  designation: 'text',
  department: 'text',
});
EmployeeSchema.index({ company: 1, isActive: 1 });
EmployeeSchema.index({ advocacyScore: -1 });

// =====================================================
// PRE-SAVE MIDDLEWARE
// =====================================================


EmployeeSchema.pre('save', async function (next) {
  // Normalize email
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase().trim();
  }

  // Normalize skills
  if (this.isModified('skills') && Array.isArray(this.skills)) {
    this.skills = this.skills.map((skill: string) =>
      skill.toLowerCase().trim()
    );
  }

  next();
});

// =====================================================
// INSTANCE METHODS
// =====================================================
interface IEmployeeMethods {
  activate(): Promise<Document & IEmployeeDocument>;
  deactivate(): Promise<Document & IEmployeeDocument>;
  updateAdvocacyScore(points: number): Promise<Document & IEmployeeDocument>;
  incrementPostCount(): Promise<Document & IEmployeeDocument>;
  decrementPostCount(): Promise<Document & IEmployeeDocument>;
}

// Activate employee
EmployeeSchema.methods.activate = async function (
  this: Document & IEmployeeDocument
) {
  this.isActive = true;
  return this.save();
};

// Deactivate employee
EmployeeSchema.methods.deactivate = async function (
  this: Document & IEmployeeDocument
) {
  this.isActive = false;
  this.endDate = new Date();
  return this.save();
};

// Update advocacy score
EmployeeSchema.methods.updateAdvocacyScore = async function (
  this: Document & IEmployeeDocument,
  points: number
) {
  this.advocacyScore = Math.max(0, this.advocacyScore + points);
  return this.save();
};

// Increment post count
EmployeeSchema.methods.incrementPostCount = async function (
  this: Document & IEmployeeDocument
) {
  this.postsCount += 1;
  return this.save();
};

// Decrement post count
EmployeeSchema.methods.decrementPostCount = async function (
  this: Document & IEmployeeDocument
) {
  if (this.postsCount > 0) {
    this.postsCount -= 1;
  }
  return this.save();
};

// =====================================================
// STATIC METHODS
// =====================================================
interface IEmployeeModel extends Model<IEmployeeDocument, Record<string, never>, IEmployeeMethods> {
  findActive(): Query<IEmployeeDocument[], IEmployeeDocument>;
  findByCompany(companyId: string): Query<IEmployeeDocument[], IEmployeeDocument>;
  findByEmail(email: string): Query<IEmployeeDocument | null, IEmployeeDocument>;
  searchEmployees(searchTerm: string): Query<IEmployeeDocument[], IEmployeeDocument>;
  getTopAdvocates(limit?: number): Query<IEmployeeDocument[], IEmployeeDocument>;
}

// Find active employees
EmployeeSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

// Find employees by company
EmployeeSchema.statics.findByCompany = function (companyId: string) {
  return this.find({ company: companyId, isActive: true })
    .populate('company', 'name logo')
    .sort({ createdAt: -1 });
};

// Find employee by email
EmployeeSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Search employees
EmployeeSchema.statics.searchEmployees = function (searchTerm: string) {
  return this.find({
    $text: { $search: searchTerm },
    isActive: true
  }).sort({ score: { $meta: 'textScore' } });
};

// Get top advocates
EmployeeSchema.statics.getTopAdvocates = function (limit = 10) {
  return this.find({ isActive: true })
    .sort({ advocacyScore: -1 })
    .limit(limit)
    .populate('company', 'name logo');
};

// =====================================================
// VIRTUALS
// =====================================================

// Full name virtual
EmployeeSchema.virtual('fullName').get(function (this: IEmployeeDocument) {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Profile completeness
EmployeeSchema.virtual('profileCompleteness').get(function (this: IEmployeeDocument) {
  let score = 0;
  const fields = [
    this.firstName,
    this.lastName,
    this.email,
    this.designation,
    this.profileImage,
    this.bio,
    this.phone,
    this.location?.city,
    this.skills?.length,
    this.socialLinks?.linkedin
  ];

  fields.forEach(field => {
    if (field) score += 10;
  });

  return Math.min(100, score);
});

// Ensure virtuals are included in JSON
EmployeeSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;
    return ret;
  }
});

EmployeeSchema.set('toObject', { virtuals: true });

// =====================================================
// CREATE AND EXPORT MODEL
// =====================================================
const Employee = mongoose.model<IEmployeeDocument, IEmployeeModel>(
  'Employee',
  EmployeeSchema
);

export default Employee;
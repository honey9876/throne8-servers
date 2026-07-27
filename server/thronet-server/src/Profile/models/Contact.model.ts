import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface IPhone {
    phoneNumber: string;
    type: 'mobile' | 'home' | 'work';
    isPrimary: boolean;
    countryCode?: string;
}

export interface IWebsite {
    url: string;
    type: 'personal' | 'company' | 'portfolio' | 'blog' | 'social' | 'other';
    label?: string;
}

export interface IAddress {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    fullAddress?: string;
}

export interface IBirthday {
    day: number;
    month: number;
    year?: number;
    hideYear: boolean;
}

export interface IContact extends Document {
    contactId: string;
    userId: string;
    profileUrl?: string;
    phones: IPhone[];
    birthday?: IBirthday;
    address?: IAddress;
    websites: IWebsite[];
    privacy: {
        phoneVisibility: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility: 'public' | 'connections' | 'private' | 'me_only';
    };
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    primaryPhone?: string;
    age?: number;
}

export interface IContactModel extends Model<IContact> {
    findByUserId(userId: string): Promise<IContact | null>;
    findActiveById(contactId: string, userId: string): Promise<IContact | null>;
    checkProfileUrlAvailability(profileUrl: string, excludeContactId?: string): Promise<boolean>;
}

const PhoneSchema = new Schema<IPhone>(
    {
        phoneNumber: {
            type: String,
            required: [true, 'Phone number is required'],
            validate: {
                validator: (v: string) => /^\+?[1-9]\d{9,14}$/.test(v),
                message: 'Invalid phone number format',
            },
        },
        type: { type: String, enum: ['mobile', 'home', 'work'], default: 'mobile' },
        isPrimary: { type: Boolean, default: false },
        countryCode: { type: String, maxlength: 5 },
    },
    { _id: false }
);

const WebsiteSchema = new Schema<IWebsite>(
    {
        url: {
            type: String,
            required: [true, 'Website URL is required'],
            maxlength: [500, 'URL cannot exceed 500 characters'],
            validate: {
                validator: (v: string) => {
                    try { new URL(v); return true; } catch { return false; }
                },
                message: 'Invalid URL format',
            },
        },
        type: {
            type: String,
            enum: ['personal', 'company', 'portfolio', 'blog', 'social', 'other'],
            default: 'personal',
        },
        label: { type: String, maxlength: [50, 'Label cannot exceed 50 characters'] },
    },
    { _id: false }
);

const AddressSchema = new Schema<IAddress>(
    {
        street: { type: String, maxlength: 200 },
        city: { type: String, maxlength: 100 },
        state: { type: String, maxlength: 100 },
        country: { type: String, maxlength: 100 },
        postalCode: { type: String, maxlength: 20 },
        fullAddress: { type: String, maxlength: 500 },
    },
    { _id: false }
);

const BirthdaySchema = new Schema<IBirthday>(
    {
        day: { type: Number, required: [true, 'Day is required'], min: 1, max: 31 },
        month: { type: Number, required: [true, 'Month is required'], min: 1, max: 12 },
        year: {
            type: Number,
            min: [1900, 'Year must be after 1900'],
            max: [new Date().getFullYear() - 13, 'User must be at least 13 years old'],
        },
        hideYear: { type: Boolean, default: false },
    },
    { _id: false }
);

const ContactSchema = new Schema<IContact, IContactModel>(
    {
        contactId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,
            validate: {
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },
        profileUrl: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
            minlength: [3, 'Profile URL must be at least 3 characters'],
            maxlength: [50, 'Profile URL cannot exceed 50 characters'],
            validate: {
                validator: (v: string) => !v || /^[a-z0-9_-]+$/.test(v),
                message: 'Profile URL can only contain lowercase letters, numbers, underscore, and hyphen',
            },
        },
        phones: {
            type: [PhoneSchema],
            default: [],
            validate: {
                validator: (v: IPhone[]) => v.length <= 3,
                message: 'Maximum 3 phone numbers allowed',
            },
        },
        birthday: { type: BirthdaySchema, default: null },
        address: { type: AddressSchema, default: null },
        websites: {
            type: [WebsiteSchema],
            default: [],
            validate: {
                validator: (v: IWebsite[]) => v.length <= 3,
                message: 'Maximum 3 websites allowed',
            },
        },
        privacy: {
            phoneVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'connections',
            },
            birthdayVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'connections',
            },
            addressVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'private',
            },
            phoneDiscovery: {
                type: String,
                enum: ['anyone', 'connections_only', 'no_one'],
                default: 'connections_only',
            },
            contactButtonVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'public',
            },
        },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'contacts',
        toJSON: {
            virtuals: true,
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

ContactSchema.index({ userId: 1, isDeleted: 1 });

ContactSchema.index({ createdAt: -1 });

ContactSchema.virtual('primaryPhone').get(function (this: IContact) {
    const primary = this.phones.find((p) => p.isPrimary);
    return primary ? primary.phoneNumber : (this.phones[0]?.phoneNumber ?? null);
});

ContactSchema.virtual('age').get(function (this: IContact) {
    if (!this.birthday?.year) return null;
    const today = new Date();
    const birth = new Date(this.birthday.year, this.birthday.month - 1, this.birthday.day);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
});

ContactSchema.pre('save', function (next) {
    if (this.phones?.length > 0) {
        const primaryCount = this.phones.filter((p) => p.isPrimary).length;
        if (primaryCount === 0) {
            this.phones[0].isPrimary = true;
        } else if (primaryCount > 1) {
            let found = false;
            this.phones.forEach((phone) => {
                if (phone.isPrimary && !found) { found = true; }
                else { phone.isPrimary = false; }
            });
        }
    }
    next();
});

ContactSchema.pre('save', function (next) {
    if (this.birthday) {
        const { day, month, year } = this.birthday;
        const daysInMonth = new Date(year ?? 2000, month, 0).getDate();
        if (day > daysInMonth) {
            return next(new Error(`Invalid date: Day ${day} does not exist in month ${month}`));
        }
    }
    next();
});

ContactSchema.statics.findByUserId = async function (userId: string): Promise<IContact | null> {
    try {
        return await this.findOne({ userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find contact by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

ContactSchema.statics.findActiveById = async function (
    contactId: string,
    userId: string
): Promise<IContact | null> {
    try {
        return await this.findOne({ contactId, userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find active contact by ID failed', {
            error: (error as Error).message,
            contactId,
            userId,
        });
        throw error;
    }
};

ContactSchema.statics.checkProfileUrlAvailability = async function (
    profileUrl: string,
    excludeContactId?: string
): Promise<boolean> {
    try {
        const query: Record<string, unknown> = {
            profileUrl: profileUrl.toLowerCase(),
            isDeleted: false,
        };
        if (excludeContactId) query.contactId = { $ne: excludeContactId };
        const existing = await this.findOne(query).exec();
        return !existing;
    } catch (error: unknown) {
        LoggerUtil.error('Check profile URL availability failed', {
            error: (error as Error).message,
            profileUrl,
        });
        throw error;
    }
};

const Contact = mongoose.model<IContact, IContactModel>('Contact', ContactSchema);
export default Contact;